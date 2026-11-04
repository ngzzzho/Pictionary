import UIKit
import Capacitor
import WebKit
import Photos

class SceneDelegate: UIResponder, UIWindowSceneDelegate, WKScriptMessageHandler, WKScriptMessageHandlerWithReply {
    private weak var textEntryAlert: UIAlertController?
    private var textEntryReply: ((Any?, String?) -> Void)?
    private var artworkExporting = false
    private var privacyCover: UIView?
    private var tvSafetyWindow: UIWindow?
    private var textSizeObserver: NSObjectProtocol?
    var window: UIWindow?
    var tvForeground = false
    var tvWebView: WKWebView? { (window?.rootViewController as? CAPBridgeViewController)?.webView }

    func scene(_ scene: UIScene, willConnectTo session: UISceneSession, options connectionOptions: UIScene.ConnectionOptions) {
        guard session.role == .windowApplication, let windowScene = scene as? UIWindowScene else { return }

        window = UIWindow(windowScene: windowScene)
        let controller = PrivateBridgeController()
        window?.rootViewController = controller
        controller.loadViewIfNeeded()
        let typography = WKUserScript(source: typographyScript(), injectionTime: .atDocumentEnd, forMainFrameOnly: true)
        controller.webView?.configuration.userContentController.addUserScript(typography)
        textSizeObserver = NotificationCenter.default.addObserver(forName: UIContentSizeCategory.didChangeNotification, object: nil, queue: .main) { [weak self] _ in
            self?.applyTypography()
        }
        controller.webView?.configuration.userContentController.add(self, name: "partyState")
        controller.webView?.configuration.userContentController.add(self, name: "partyFeedback")
        controller.webView?.configuration.userContentController.add(self, name: "partyExport")
        controller.webView?.configuration.userContentController.addScriptMessageHandler(self, contentWorld: .page, name: "partyTV")
        controller.webView?.configuration.userContentController.addScriptMessageHandler(self, contentWorld: .page, name: "partyArtwork")
        controller.webView?.configuration.userContentController.addScriptMessageHandler(self, contentWorld: .page, name: "partyBackup")
        controller.webView?.configuration.userContentController.addScriptMessageHandler(self, contentWorld: .page, name: "partyPurchase")
        controller.webView?.configuration.userContentController.addScriptMessageHandler(self, contentWorld: .page, name: "partyTextEntry")
        PurchaseStore.shared.onChange = { [weak self] in
            self?.tvWebView?.evaluateJavaScript("window.dispatchEvent(new Event('purchase-status-changed'))", completionHandler: nil)
        }
        setTVSafetyCover(true, reason: "initializing", enabled: false)
        TVCoordinator.shared.attach(self)
        window?.makeKeyAndVisible()

        SceneDelegateProxy.shared.scene(scene, willConnectTo: session, options: connectionOptions)
    }

    private func typographyScript() -> String {
        let scale = max(1.0, UIFont.preferredFont(forTextStyle: .body).pointSize / 17.0)
        return "document.documentElement.style.setProperty('--text-scale', '\(scale)'); document.documentElement.classList.toggle('large-text', \(scale > 1.35 ? "true" : "false"));"
    }

    private func applyTypography() {
        (window?.rootViewController as? CAPBridgeViewController)?.webView?.evaluateJavaScript(typographyScript(), completionHandler: nil)
    }

    deinit {
        if let observer = textSizeObserver { NotificationCenter.default.removeObserver(observer) }
    }

    func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
        if message.name == "partyFeedback" {
            guard window?.windowScene?.activationState == .foregroundActive,
                  let kind = message.body as? String else { return }
            switch kind {
            case "correct", "complete": UINotificationFeedbackGenerator().notificationOccurred(.success)
            case "timeout": UINotificationFeedbackGenerator().notificationOccurred(.warning)
            case "selection": UISelectionFeedbackGenerator().selectionChanged()
            case "go", "handoff": UIImpactFeedbackGenerator(style: .light).impactOccurred()
            default: break
            }
            return
        }
        if message.name == "partyExport" {
            guard TVCoordinator.shared.privateAllowed, message.webView === tvWebView, message.frameInfo.isMainFrame,
                  message.frameInfo.securityOrigin.protocol == "capacitor", message.frameInfo.securityOrigin.host == "localhost",
                  let json = message.body as? String, let data = json.data(using: .utf8), data.count < 20_000_000,
                  let controller = window?.rootViewController else { return }
            do {
                let file = FileManager.default.temporaryDirectory.appendingPathComponent("SketchAndGuess-backup.json")
                try data.write(to: file, options: .atomic)
                let sheet = UIActivityViewController(activityItems: [file], applicationActivities: nil)
                sheet.popoverPresentationController?.sourceView = controller.view
                sheet.popoverPresentationController?.sourceRect = CGRect(x: controller.view.bounds.midX, y: controller.view.bounds.midY, width: 1, height: 1)
                controller.present(sheet, animated: true)
            } catch {
                let alert = UIAlertController(title: TVStrings.text("backupUnavailable"), message: error.localizedDescription, preferredStyle: .alert)
                alert.addAction(UIAlertAction(title: TVStrings.text("ok"), style: .default))
                controller.present(alert, animated: true)
            }
            return
        }
        guard message.name == "partyState", let body = message.body as? [String: Any],
              let playing = body["playing"] as? Bool else { return }
        UIApplication.shared.isIdleTimerDisabled = playing && window?.windowScene?.activationState == .foregroundActive
    }

    // Explicit image-only export. Add-only Photos permission never reads the library.
    func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage, replyHandler: @escaping (Any?, String?) -> Void) {
        if message.name == "partyTextEntry" {
            guard message.webView === tvWebView, message.frameInfo.isMainFrame,
                  message.frameInfo.securityOrigin.protocol == "capacitor", message.frameInfo.securityOrigin.host == "localhost",
                  let body = message.body as? [String: Any], Set(body.keys) == Set(["title", "value", "limit"]),
                  let title = body["title"] as? String, title.utf16.count <= 200,
                  let value = body["value"] as? String, value.utf16.count <= 60,
                  let limit = TVPublicFrame.integer(body["limit"], minimum: 20, maximum: 30), [20,30].contains(limit),
                  TVCoordinator.shared.privateAllowed, window?.windowScene?.activationState == .foregroundActive,
                  let controller = window?.rootViewController, controller.presentedViewController == nil,
                  textEntryReply == nil else { replyHandler(nil, "Text entry unavailable"); return }
            let alert = UIAlertController(title: title, message: nil, preferredStyle: .alert)
            alert.addTextField { field in field.text = value; field.autocorrectionType = .no }
            textEntryReply = replyHandler
            textEntryAlert = alert
            alert.addAction(UIAlertAction(title: TVStrings.text("cancel"), style: .cancel) { [weak self] _ in self?.finishTextEntry(nil) })
            alert.addAction(UIAlertAction(title: TVStrings.text("ok"), style: .default) { [weak self, weak alert] _ in
                self?.finishTextEntry(String((alert?.textFields?.first?.text ?? "").prefix(limit)))
            })
            controller.present(alert, animated: true)
            return
        }
        if message.name == "partyPurchase" {
            guard message.webView === tvWebView, message.frameInfo.isMainFrame,
                  message.frameInfo.securityOrigin.protocol == "capacitor",
                  message.frameInfo.securityOrigin.host == "localhost",
                  let body = message.body as? [String: Any], body.count == 1,
                  let action = body["action"] as? String,
                  ["status", "products", "purchase", "restore"].contains(action) else {
                replyHandler(nil, "Unowned purchase request"); return
            }
            if action != "status" {
                guard TVCoordinator.shared.privateAllowed,
                      window?.windowScene?.activationState == .foregroundActive else {
                    replyHandler(nil, "Purchase unavailable while covered"); return
                }
            }
            Task { @MainActor in replyHandler(await PurchaseStore.shared.handle(action), nil) }
            return
        }
        if message.name == "partyTV" {
            guard message.webView === tvWebView, message.frameInfo.isMainFrame,
                  message.frameInfo.securityOrigin.protocol == "capacitor", message.frameInfo.securityOrigin.host == "localhost" else {
                replyHandler(nil, "Unowned TV request"); return
            }
            replyHandler(TVCoordinator.shared.receive(message.body, from: self), nil); return
        }
        if message.name == "partyBackup" {
            guard TVCoordinator.shared.privateAllowed, message.webView === tvWebView, message.frameInfo.isMainFrame,
                  message.frameInfo.securityOrigin.protocol == "capacitor",
                  message.frameInfo.securityOrigin.host == "localhost",
                  window?.windowScene?.activationState == .foregroundActive,
                  !artworkExporting,
                  let body = message.body as? [String: Any],
                  let name = body["name"] as? String,
                  name.range(of: "^Sketch-and-Guess-[a-f0-9]{12}-[0-9]{1,3}-of-[0-9]{1,3}\\.json$", options: .regularExpression) != nil,
                  let text = body["text"] as? String, let data = text.data(using: .utf8), data.count <= 5_000_000,
                  let controller = window?.rootViewController, controller.presentedViewController == nil else {
                replyHandler(["status": "failed"], nil); return
            }
            artworkExporting = true
            let finish: (String) -> Void = { status in
                DispatchQueue.main.async { self.artworkExporting = false; replyHandler(["status": status], nil) }
            }
            do {
                let folder = FileManager.default.temporaryDirectory.appendingPathComponent("backup-" + UUID().uuidString, isDirectory: true)
                try FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true)
                let file = folder.appendingPathComponent(name)
                do { try data.write(to: file, options: .atomic) }
                catch { try? FileManager.default.removeItem(at: folder); throw error }
                let sheet = UIActivityViewController(activityItems: [file], applicationActivities: nil)
                sheet.popoverPresentationController?.sourceView = controller.view
                sheet.popoverPresentationController?.sourceRect = CGRect(x: controller.view.bounds.midX, y: controller.view.bounds.midY, width: 1, height: 1)
                sheet.completionWithItemsHandler = { _, completed, _, error in
                    try? FileManager.default.removeItem(at: folder)
                    finish(error != nil ? "failed" : completed ? "shared" : "cancelled")
                }
                controller.present(sheet, animated: true)
            } catch { finish("failed") }
            return
        }
        guard message.name == "partyArtwork", TVCoordinator.shared.privateAllowed, message.webView === tvWebView, message.frameInfo.isMainFrame,
              message.frameInfo.securityOrigin.protocol == "capacitor",
              message.frameInfo.securityOrigin.host == "localhost",
              window?.windowScene?.activationState == .foregroundActive,
              !artworkExporting,
              let body = message.body as? [String: Any],
              let action = body["action"] as? String, ["save", "share"].contains(action),
              let png = body["png"] as? String, png.count < 16_000_000,
              png.hasPrefix("data:image/png;base64,"),
              let data = Data(base64Encoded: String(png.dropFirst(22))), data.count >= 24,
              Array(data.prefix(8)) == [137, 80, 78, 71, 13, 10, 26, 10],
              let controller = window?.rootViewController, controller.presentedViewController == nil else {
            replyHandler(["status": "failed"], nil)
            return
        }
        // Validate IHDR before decoding; accept legacy canvases and branded exports with their 400px footer.
        let width = data[16..<20].reduce(UInt32(0)) { ($0 << 8) | UInt32($1) }
        let height = data[20..<24].reduce(UInt32(0)) { ($0 << 8) | UInt32($1) }
        guard width == 1600, [1200, 1600, 2000].contains(height), UIImage(data: data) != nil else {
            replyHandler(["status": "failed"], nil)
            return
        }
        artworkExporting = true
        let finish: (String) -> Void = { status in
            DispatchQueue.main.async {
                self.artworkExporting = false
                replyHandler(["status": status], nil)
            }
        }
        if action == "save" {
            PHPhotoLibrary.requestAuthorization(for: .addOnly) { status in
                guard status == .authorized || status == .limited else { finish("denied"); return }
                PHPhotoLibrary.shared().performChanges({
                    let request = PHAssetCreationRequest.forAsset()
                    request.addResource(with: .photo, data: data, options: nil)
                }, completionHandler: { success, _ in finish(success ? "saved" : "failed") })
            }
            return
        }
        do {
            let folder = FileManager.default.temporaryDirectory.appendingPathComponent("drawing-" + UUID().uuidString, isDirectory: true)
            try FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true)
            let file = folder.appendingPathComponent("Sketch-and-Guess-drawing.png")
            do { try data.write(to: file, options: .atomic) }
            catch { try? FileManager.default.removeItem(at: folder); throw error }
            let sheet = UIActivityViewController(activityItems: [file], applicationActivities: nil)
            sheet.popoverPresentationController?.sourceView = controller.view
            sheet.popoverPresentationController?.sourceRect = CGRect(x: controller.view.bounds.midX, y: controller.view.bounds.midY, width: 1, height: 1)
            sheet.completionWithItemsHandler = { _, completed, _, error in
                try? FileManager.default.removeItem(at: folder)
                finish(error != nil ? "failed" : completed ? "shared" : "cancelled")
            }
            controller.present(sheet, animated: true)
        } catch { finish("failed") }
    }

    private func finishTextEntry(_ value: String?) {
        let reply = textEntryReply
        textEntryReply = nil
        textEntryAlert = nil
        reply?(["cancelled": value == nil, "value": value ?? ""], nil)
    }
    private func cancelTextEntry() {
        let alert = textEntryAlert
        finishTextEntry(nil)
        alert?.dismiss(animated: false)
    }
    func setTVSafetyCover(_ visible: Bool, reason: String, enabled: Bool) {
        if visible { cancelTextEntry() }
        guard let window, let windowScene = window.windowScene else { return }
        if privacyCover == nil {
            // A separate non-key native window remains above app-owned modal
            // presentation containers. It never captures or renders app pixels.
            let safetyWindow = UIWindow(windowScene: windowScene)
            safetyWindow.frame = window.frame
            safetyWindow.windowLevel = UIWindow.Level(rawValue: UIWindow.Level.alert.rawValue + 1)
            safetyWindow.backgroundColor = UIColor(red: 0.969, green: 0.965, blue: 0.941, alpha: 1)
            let safetyController = UIViewController()
            let cover = UIView(frame: safetyWindow.bounds)
            cover.backgroundColor = UIColor(red: 0.969, green: 0.965, blue: 0.941, alpha: 1)
            cover.isOpaque = true
            cover.autoresizingMask = [.flexibleWidth, .flexibleHeight]
            cover.accessibilityViewIsModal = true
            let icon = UIImageView(image: UIImage(systemName: "rectangle.on.rectangle"))
            icon.tag = 7103
            icon.tintColor = UIColor(red: 0.07, green: 0.24, blue: 0.33, alpha: 1)
            icon.contentMode = .scaleAspectFit
            icon.isAccessibilityElement = false
            icon.heightAnchor.constraint(equalToConstant: 48).isActive = true
            let label = UILabel()
            label.tag = 7101
            label.numberOfLines = 0
            label.textAlignment = .center
            label.font = .preferredFont(forTextStyle: .title2)
            label.adjustsFontForContentSizeCategory = true
            label.textColor = UIColor(red: 0.07, green: 0.24, blue: 0.33, alpha: 1)
            let steps = UILabel()
            steps.tag = 7104
            steps.numberOfLines = 0
            steps.textAlignment = .natural
            steps.font = .preferredFont(forTextStyle: .body)
            steps.adjustsFontForContentSizeCategory = true
            steps.textColor = label.textColor
            let hint = UILabel()
            hint.tag = 7105
            hint.numberOfLines = 0
            hint.textAlignment = .center
            hint.font = .preferredFont(forTextStyle: .body)
            hint.adjustsFontForContentSizeCategory = true
            hint.textColor = label.textColor
            let button = UIButton(type: .system)
            button.tag = 7102
            var configuration = UIButton.Configuration.filled()
            configuration.title = TVStrings.text("turnOff")
            configuration.titleAlignment = .center
            configuration.titleLineBreakMode = .byWordWrapping
            button.configuration = configuration
            button.titleLabel?.font = .preferredFont(forTextStyle: .headline)
            button.titleLabel?.adjustsFontForContentSizeCategory = true
            button.titleLabel?.numberOfLines = 0
            button.addTarget(self, action: #selector(turnOffTV), for: .touchUpInside)
            button.heightAnchor.constraint(greaterThanOrEqualToConstant: 52).isActive = true
            let stack = UIStackView(arrangedSubviews: [icon, label, steps, hint, button])
            stack.axis = .vertical; stack.spacing = 24; stack.translatesAutoresizingMaskIntoConstraints = false
            let scroll = UIScrollView()
            scroll.translatesAutoresizingMaskIntoConstraints = false
            scroll.alwaysBounceVertical = true
            cover.addSubview(scroll)
            scroll.addSubview(stack)
            NSLayoutConstraint.activate([
                scroll.leadingAnchor.constraint(equalTo: cover.safeAreaLayoutGuide.leadingAnchor),
                scroll.trailingAnchor.constraint(equalTo: cover.safeAreaLayoutGuide.trailingAnchor),
                scroll.topAnchor.constraint(equalTo: cover.safeAreaLayoutGuide.topAnchor),
                scroll.bottomAnchor.constraint(equalTo: cover.safeAreaLayoutGuide.bottomAnchor),
                stack.leadingAnchor.constraint(equalTo: scroll.contentLayoutGuide.leadingAnchor, constant: 24),
                stack.trailingAnchor.constraint(equalTo: scroll.contentLayoutGuide.trailingAnchor, constant: -24),
                stack.topAnchor.constraint(equalTo: scroll.contentLayoutGuide.topAnchor, constant: 24),
                stack.bottomAnchor.constraint(equalTo: scroll.contentLayoutGuide.bottomAnchor, constant: -24),
                stack.widthAnchor.constraint(equalTo: scroll.frameLayoutGuide.widthAnchor, constant: -48),
            ])
            safetyController.view = cover
            safetyWindow.rootViewController = safetyController
            tvSafetyWindow = safetyWindow
            privacyCover = cover
        }
        if let label = privacyCover?.viewWithTag(7101) as? UILabel {
            if reason == "captured" || reason == "route" {
                label.text = TVStrings.text("protected")
            } else if enabled {
                label.text = TVStrings.text("waiting")
            } else {
                label.text = TVStrings.text("preparing")
            }
        }
        let showConnectionGuide = enabled && reason == "waiting"
        privacyCover?.viewWithTag(7103)?.isHidden = !showConnectionGuide
        if let steps = privacyCover?.viewWithTag(7104) as? UILabel {
            steps.text = TVStrings.text("connectionSteps")
            steps.isHidden = !showConnectionGuide
        }
        if let hint = privacyCover?.viewWithTag(7105) as? UILabel {
            hint.text = TVStrings.text("connectionHint")
            hint.isHidden = !showConnectionGuide
        }
        if let button = privacyCover?.viewWithTag(7102) as? UIButton {
            var configuration = button.configuration
            configuration?.title = TVStrings.text("turnOff")
            button.configuration = configuration
            button.isHidden = !enabled
        }
        window.accessibilityElementsHidden = visible
        window.rootViewController?.view.accessibilityElementsHidden = visible
        window.rootViewController?.view.isUserInteractionEnabled = !visible
        tvSafetyWindow?.frame = window.frame
        tvSafetyWindow?.isHidden = !visible
        if visible, let privacyCover {
            privacyCover.frame = tvSafetyWindow?.bounds ?? window.bounds
            tvSafetyWindow?.layoutIfNeeded()
            UIApplication.shared.isIdleTimerDisabled = false
        }
    }
    @objc private func turnOffTV() { TVCoordinator.shared.turnOff() }
    func sceneWillResignActive(_ scene: UIScene) {
        tvForeground = false
        TVCoordinator.shared.transition("background")
        UIApplication.shared.isIdleTimerDisabled = false
        tvWebView?.evaluateJavaScript("window.dispatchEvent(new Event('native-pause'))", completionHandler: nil)
    }
    func sceneDidBecomeActive(_ scene: UIScene) {
        tvForeground = true
        applyTypography()
        TVCoordinator.shared.transition("reconnecting")
        tvWebView?.evaluateJavaScript("window.dispatchEvent(new Event('native-active'))", completionHandler: nil)
    }
    func sceneDidDisconnect(_ scene: UIScene) { cancelTextEntry(); tvForeground = false; TVCoordinator.shared.detach(self) }
    func sceneDidEnterBackground(_ scene: UIScene) { tvForeground = false; TVCoordinator.shared.transition("background") }
    func windowScene(_ windowScene: UIWindowScene, didUpdate previousCoordinateSpace: UICoordinateSpace, interfaceOrientation previousInterfaceOrientation: UIInterfaceOrientation, traitCollection previousTraitCollection: UITraitCollection) { TVCoordinator.shared.geometryChanged() }
    @available(iOS 26.0, *)
    func windowScene(_ windowScene: UIWindowScene, didUpdateEffectiveGeometry previousEffectiveGeometry: UIWindowScene.Geometry) { TVCoordinator.shared.geometryChanged() }

    func scene(_ scene: UIScene, openURLContexts URLContexts: Set<UIOpenURLContext>) {
        SceneDelegateProxy.shared.scene(scene, openURLContexts: URLContexts)
    }

    func scene(_ scene: UIScene, continue userActivity: NSUserActivity) {
        SceneDelegateProxy.shared.scene(scene, continue: userActivity)
    }
}
