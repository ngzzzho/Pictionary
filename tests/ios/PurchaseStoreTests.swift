import XCTest
import StoreKit
import StoreKitTest
@testable import PurchaseQA

@MainActor
final class PurchaseStoreTests: XCTestCase {
    var session: SKTestSession!
    override func setUpWithError() throws {
        print("QA: initialize session")
        session = try SKTestSession(configurationFileNamed: "FullGame")
        print("QA: reset session")
        session.resetToDefaultState()
        session.clearTransactions()
        session.disableDialogs = true
        print("QA: session ready")
    }
    override func tearDownWithError() throws {
        session.clearTransactions()
        print("QA: reset session")
        session.resetToDefaultState()
    }
    func testPurchaseRestoreColdStoreRefund() async throws {
        let store = PurchaseStore()
        let initial = await store.handle("status")
        XCTAssertEqual(initial["unlocked"] as? Bool, false)
        let products = await store.handle("products")
        XCTAssertEqual(products["available"] as? Bool, true)
        XCTAssertFalse((products["price"] as? String ?? "").isEmpty)
        let purchased = await store.handle("purchase")
        XCTAssertEqual(purchased["result"] as? String, "purchased")
        XCTAssertTrue(store.unlocked)
        let cold = PurchaseStore()
        await cold.refreshEntitlement()
        XCTAssertTrue(cold.unlocked, "A fresh store reads Apple's verified local entitlement")
        let restored = await cold.handle("restore")
        XCTAssertEqual(restored["result"] as? String, "restored")
        let transaction = try XCTUnwrap(session.allTransactions().first)
        try session.refundTransaction(identifier: transaction.identifier)
        for _ in 0..<30 {
            await cold.refreshEntitlement()
            if !cold.unlocked { break }
            try await Task.sleep(for: .milliseconds(100))
        }
        XCTAssertFalse(cold.unlocked)
        let afterRefund = await cold.handle("restore")
        XCTAssertEqual(afterRefund["result"] as? String, "notFound")
    }
    func testVerifiedPurchaseUnlocksBeforeEntitlementListCatchesUp() async throws {
        // Genuine signed local StoreKit result, with a deliberately lagging scan.
        let store = PurchaseStore(currentEntitlements: { [] })
        let result = await store.handle("purchase")
        XCTAssertEqual(result["result"] as? String, "purchased")
        XCTAssertTrue(store.unlocked)
        let refreshed = await store.handle("status")
        XCTAssertEqual(refreshed["unlocked"] as? Bool, true,
                       "Foreground status must not undo the verified purchase while the list lags")
        let transaction = try XCTUnwrap(session.allTransactions().first)
        try session.refundTransaction(identifier: transaction.identifier)
        for _ in 0..<30 {
            await store.refreshEntitlement()
            if !store.unlocked { break }
            try await Task.sleep(for: .milliseconds(100))
        }
        XCTAssertFalse(store.unlocked, "Latest-transaction fallback must honor a refund")
    }
    func testEarlierEmptyScanCannotOverwriteVerifiedTransactionUpdate() async throws {
        var continuation: CheckedContinuation<[VerificationResult<Transaction>], Never>?
        let store = PurchaseStore(currentEntitlements: {
            await withCheckedContinuation { continuation = $0 }
        })
        let scan = Task { @MainActor in await store.refreshEntitlement() }
        for _ in 0..<30 {
            if continuation != nil { break }
            try await Task.sleep(for: .milliseconds(20))
        }
        XCTAssertNotNil(continuation)
        try await session.buyProduct(identifier: PurchaseStore.productID)
        for _ in 0..<30 {
            if store.unlocked { break }
            try await Task.sleep(for: .milliseconds(100))
        }
        XCTAssertTrue(store.unlocked)
        continuation?.resume(returning: [])
        await scan.value
        XCTAssertTrue(store.unlocked, "Pre-purchase scan must not overwrite newer verified authority")
    }
    func testPendingThenApproval() async throws {
        session.askToBuyEnabled = true
        let store = PurchaseStore()
        let pending = await store.handle("purchase")
        XCTAssertEqual(pending["result"] as? String, "pending")
        XCTAssertFalse(store.unlocked)
        let transaction = try XCTUnwrap(session.allTransactions().first)
        try session.approveAskToBuyTransaction(identifier: transaction.identifier)
        for _ in 0..<30 {
            if store.unlocked { break }
            try await Task.sleep(for: .milliseconds(100))
        }
        XCTAssertTrue(store.unlocked, "Transaction.updates must grant approved purchases")
    }
    func testCancelledPurchaseDoesNotUnlock() async throws {
        // Exercise the production purchase result handler with Apple's cancel
        // result. This simulator maps injected .userCancelled to .unknown;
        // the separate injected-error test retains that fail-closed evidence.
        let store = PurchaseStore(purchaseProduct: { _ in .userCancelled })
        let response = await store.handle("purchase")
        XCTAssertEqual(response["result"] as? String, "cancelled")
        XCTAssertFalse(store.unlocked)
    }
    func testStoreKitInjectedErrorFailsClosed() async throws {
        try await session.setSimulatedError(.generic(.userCancelled), forAPI: .purchase)
        let store = PurchaseStore()
        let response = await store.handle("purchase")
        XCTAssertTrue(["failed", "cancelled"].contains(response["result"] as? String ?? ""))
        XCTAssertFalse(store.unlocked)
    }
    func testFailedRestoreKeepsVerifiedOwnership() async throws {
        let store = PurchaseStore()
        _ = await store.handle("purchase")
        XCTAssertTrue(store.unlocked)
        try await session.setSimulatedError(.generic(.networkError(URLError(.notConnectedToInternet))), forAPI: .appStoreSync)
        let restored = await store.handle("restore")
        XCTAssertEqual(restored["result"] as? String, "failed")
        XCTAssertTrue(store.unlocked)
    }
    func testUnverifiedTransactionNeverUnlocks() async throws {
        try await session.setSimulatedError(.verification(.invalidSignature), forAPI: .verification)
        let store = PurchaseStore()
        let result = await store.handle("purchase")
        XCTAssertEqual(result["unlocked"] as? Bool, false)
        XCTAssertEqual(result["result"] as? String, "failed")
        await store.refreshEntitlement()
        XCTAssertFalse(store.unlocked)
    }
    func testPriceNetworkFailureDoesNotRevokeOfflineEntitlement() async throws {
        let store = PurchaseStore()
        let bought = await store.handle("purchase")
        XCTAssertEqual(bought["unlocked"] as? Bool, true)
        try await session.setSimulatedError(.generic(.networkError(URLError(.notConnectedToInternet))), forAPI: .loadProducts)
        let cold = PurchaseStore()
        let status = await cold.handle("status")
        XCTAssertEqual(status["unlocked"] as? Bool, true)
        let failedPrice = await cold.handle("products")
        XCTAssertEqual(failedPrice["unlocked"] as? Bool, true)
        XCTAssertEqual(failedPrice["available"] as? Bool, false)
    }
}
