import Foundation
import StoreKit

/// Apple-verified transactions are the only entitlement source. StoreKit keeps
/// signed current entitlements on device for offline launches; no defaults flag.
@MainActor
final class PurchaseStore {
    static let shared = PurchaseStore()
    static let productID = "com.local.familydraw.fullversion"
    private(set) var unlocked = false
    private(set) var ready = false
    private(set) var busy = false
    private var product: Product?
    private let purchaseProduct: (Product) async throws -> Product.PurchaseResult
    private let currentEntitlements: () async -> [VerificationResult<Transaction>]
    private var updates: Task<Void, Never>?
    private var revision = 0
    var onChange: (() -> Void)?

    init(
        purchaseProduct: @escaping (Product) async throws -> Product.PurchaseResult = { try await $0.purchase() },
        currentEntitlements: @escaping () async -> [VerificationResult<Transaction>] = {
            var results: [VerificationResult<Transaction>] = []
            for await result in Transaction.currentEntitlements { results.append(result) }
            return results
        }
    ) {
        self.purchaseProduct = purchaseProduct
        self.currentEntitlements = currentEntitlements
        updates = Task { [weak self] in
            for await result in Transaction.updates {
                guard let self else { return }
                guard case .verified(let transaction) = result,
                      transaction.productID == Self.productID else { continue }
                self.applyVerified(transaction)
                await transaction.finish()
                self.onChange?()
            }
        }
    }
    deinit { updates?.cancel() }

    func refreshEntitlement() async {
        revision += 1
        let ticket = revision
        var entitled = false
        for result in await currentEntitlements() {
            guard case .verified(let transaction) = result,
                  transaction.productID == Self.productID,
                  transaction.productType == .nonConsumable,
                  transaction.revocationDate == nil,
                  !transaction.isUpgraded else { continue }
            entitled = true
        }
        // A just-completed purchase can precede the entitlement sequence.
        // Resolve an empty scan against Apple's latest signed transaction,
        // including its revocation state; never retain an unsigned local flag.
        if !entitled,
           case .verified(let transaction) = await Transaction.latest(for: Self.productID),
           transaction.productID == Self.productID,
           transaction.productType == .nonConsumable {
            entitled = transaction.revocationDate == nil && !transaction.isUpgraded
        }
        guard ticket == revision else { return }
        unlocked = entitled
        ready = true
    }
    // Call only after StoreKit verification. A successful transaction is
    // sufficient authority; a concurrently enumerated pre-purchase list is not.
    private func applyVerified(_ transaction: Transaction) {
        guard transaction.productID == Self.productID,
              transaction.productType == .nonConsumable else { return }
        revision += 1 // invalidate any scan that began before this transaction
        unlocked = transaction.revocationDate == nil && !transaction.isUpgraded
        ready = true
    }
    private func loadProduct() async {
        do {
            product = try await Product.products(for: [Self.productID]).first(where: {
                $0.id == Self.productID && $0.type == .nonConsumable
            })
        } catch { product = nil }
    }
    func snapshot(_ result: String = "ready") -> [String: Any] {
        ["productId": Self.productID, "ready": ready, "unlocked": unlocked,
         "available": product != nil, "price": product?.displayPrice ?? "", "result": result]
    }
    func handle(_ action: String) async -> [String: Any] {
        guard ["status", "products", "purchase", "restore"].contains(action) else { return snapshot("failed") }
        guard !busy else { return snapshot("busy") }
        busy = true
        defer { busy = false }
        await refreshEntitlement()
        if action == "status" { return snapshot(unlocked ? "owned" : "ready") }
        if action == "products" {
            await loadProduct()
            return snapshot(unlocked ? "owned" : product == nil ? "unavailable" : "ready")
        }
        if action == "restore" {
            do {
                // Only an explicit Restore tap may prompt for account sync.
                try await AppStore.sync()
                await refreshEntitlement()
                return snapshot(unlocked ? "restored" : "notFound")
            } catch { return snapshot("failed") }
        }
        if unlocked { return snapshot("owned") }
        await loadProduct()
        guard let product else { return snapshot("unavailable") }
        do {
            switch try await purchaseProduct(product) {
            case .success(let result):
                guard case .verified(let transaction) = result,
                      transaction.productID == Self.productID,
                      transaction.productType == .nonConsumable,
                      transaction.revocationDate == nil,
                      !transaction.isUpgraded else { return snapshot("failed") }
                applyVerified(transaction)
                await transaction.finish()
                return snapshot(unlocked ? "purchased" : "failed")
            case .pending: return snapshot("pending")
            case .userCancelled: return snapshot("cancelled")
            @unknown default: return snapshot("failed")
            }
        } catch StoreKitError.userCancelled { return snapshot("cancelled") }
        catch { return snapshot("failed") }
    }
}
