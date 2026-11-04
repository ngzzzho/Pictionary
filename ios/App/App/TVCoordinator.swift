import UIKit
import WebKit
import Capacitor
import CoreFoundation

final class PrivateBridgeController: CAPBridgeViewController {
    override func viewDidLoad() {
        super.viewDidLoad()
        if #available(iOS 17.0, *) {
            registerForTraitChanges([UITraitSceneCaptureState.self]) { (_: PrivateBridgeController, _: UITraitCollection) in
                TVCoordinator.shared.transition("captured")
            }
        }
    }
    override func traitCollectionDidChange(_ previousTraitCollection: UITraitCollection?) {
        super.traitCollectionDidChange(previousTraitCollection)
        // Appearance changes are not capture events. Actual capture notifications remain observed.
        if #unavailable(iOS 17.0) { TVCoordinator.shared.geometryChanged() }
    }
}

// One owned application scene is the private source. Unknown/moved/captured routes remain covered.
final class TVCoordinator {
    static let shared = TVCoordinator()
    private var state = TVPrivacyState()
    private var startup = TVStartupGate()
    private weak var source: SceneDelegate?
    private var sources = NSHashTable<SceneDelegate>.weakObjects()
    private var displays = NSHashTable<TVExternalSceneDelegate>.weakObjects()
    private var anchor: UIScreen?
    private var observers: [NSObjectProtocol] = []
    private var watchdog: Timer?
    private var accessory: AnyObject?
    private var lastDetail = ""
    var privateAllowed: Bool {
        let (safe, connected, reason) = route()
        routeState(safe: safe, connected: connected, reason: reason)
        publish()
        return state.privateAllowed
    }

    private init() {
        for notification in [UIScreen.didConnectNotification, UIScreen.didDisconnectNotification, UIScreen.modeDidChangeNotification, UIScreen.capturedDidChangeNotification] {
            observers.append(NotificationCenter.default.addObserver(forName: notification, object: nil, queue: .main) { [weak self] _ in self?.transition("route") })
        }
        watchdog = Timer.scheduledTimer(withTimeInterval: 0.5, repeats: true) { [weak self] _ in
            guard let self else { return }
            if self.state.expire(now: ProcessInfo.processInfo.systemUptime) { self.blank(); self.publish() }
        }
        if let watchdog { RunLoop.main.add(watchdog, forMode: .common) }
    }
    func attach(_ delegate: SceneDelegate) {
        sources.add(delegate)
        if source == nil { source = delegate }
        transition("initializing")
        if #available(iOS 27.0, *), let controller = delegate.window?.rootViewController, accessory == nil {
            let config = UISceneConfiguration(name: "Public TV", sessionRole: .windowExternalDisplayNonInteractive)
            config.delegateClass = TVExternalSceneDelegate.self
            config.storyboard = nil
            accessory = controller.registerSceneAccessory(.externalNonInteractive(sceneConfiguration: config))
        }
    }
    func detach(_ delegate: SceneDelegate) {
        sources.remove(delegate)
        // Never silently promote a different application scene or infer a new screen anchor.
        if source === delegate { source = nil }
        transition("route")
    }
    func externalConnected(_ delegate: TVExternalSceneDelegate) { displays.add(delegate); transition("reconnecting") }
    func externalDisconnected(_ delegate: TVExternalSceneDelegate) { delegate.render(nil); displays.remove(delegate); transition("route") }
    private func captureSafe(_ delegate: SceneDelegate) -> Bool {
        guard let scene = delegate.window?.windowScene, let controller = delegate.window?.rootViewController else { return false }
        if #available(iOS 17.0, *) {
            return scene.traitCollection.sceneCaptureState == .inactive && controller.traitCollection.sceneCaptureState == .inactive && !scene.screen.isCaptured
        }
        return !scene.screen.isCaptured
    }
    private func route() -> (Bool, Bool, String) {
        guard sources.allObjects.count == 1, let source, let scene = source.window?.windowScene else { return (false, false, "route") }
        let connected = displays.allObjects.contains { $0.outputAvailable && $0.window?.windowScene?.screen !== scene.screen }
        guard source.tvForeground, scene.activationState == .foregroundActive else { return (false, connected, "background") }
        guard captureSafe(source) else { return (false, connected, "captured") }
        if anchor == nil {
            guard UIScreen.screens.count == 1, UIScreen.screens.first === scene.screen else { return (false, connected, "route") }
            anchor = scene.screen
        }
        guard anchor === scene.screen else { return (false, connected, "route") }
        // Every extra screen must have an owned, public-only external scene.
        let owned = displays.allObjects.compactMap { $0.window?.windowScene?.screen }
        guard UIScreen.screens.allSatisfy({ screen in screen === anchor || owned.contains(where: { $0 === screen }) }) else { return (false, connected, "route") }
        return (true, connected, state.enabled && !connected ? "waiting" : state.enabled ? "connected" : "off")
    }
    func transition(_ reason: String) {
        // Opaque synchronous native protection precedes JS notification or lifecycle callbacks.
        for source in sources.allObjects { source.setTVSafetyCover(true, reason: reason, enabled: state.enabled) }
        blank()
        let (safe, connected, observed) = route()
        routeState(safe: safe, connected: connected, reason: safe ? reason : observed, force: true)
        publish()
    }
    func geometryChanged() {
        // UIKit also delivers layout/geometry callbacks during ordinary launch.
        // Re-evaluate the complete route, but do not invalidate an unchanged route.
        // Capture, screen connect/disconnect and lifecycle events still force a cover.
        let (safe, connected, reason) = route()
        routeState(safe: safe, connected: connected, reason: reason)
        publish()
    }
    private func routeState(safe: Bool, connected: Bool, reason: String, force: Bool = false) {
        state.route(safe: safe, connected: connected,
                    reason: startup.reason(safe: safe, enabled: state.enabled, observed: reason), force: force)
    }
    private func blank() { for display in displays.allObjects { display.render(nil) } }
    private func publish() {
        if !state.privateAllowed || !state.enabled { blank() }
        for candidate in sources.allObjects {
            candidate.setTVSafetyCover(!(candidate === source && state.privateAllowed), reason: state.reason, enabled: state.enabled)
        }
        guard let data = try? JSONSerialization.data(withJSONObject: state.detail), let json = String(data: data, encoding: .utf8), json != lastDetail else { return }
        lastDetail = json
        source?.tvWebView?.evaluateJavaScript("window.dispatchEvent(new CustomEvent('party-tv-status',{detail:\(json)}))", completionHandler: nil)
    }
    func turnOff() { state.enable(false); blank(); let (safe, connected, reason) = route(); routeState(safe: safe, connected: connected, reason: reason); publish() }
    func receive(_ body: Any, from delegate: SceneDelegate) -> [String: Any] {
        guard delegate === source, let command = body as? [String: Any], let action = command["action"] as? String else { return state.detail }
        switch action {
        case "status":
            guard TVPublicFrame.keys(command, ["action"]) else { return state.detail }
            let (safe, connected, reason) = route(); routeState(safe: safe, connected: connected, reason: reason)
        case "locale":
            guard TVPublicFrame.keys(command, ["action", "language"]), let language = command["language"] as? String, TVStrings.codes.contains(language) else { return state.detail }
            TVStrings.language = language
            for display in displays.allObjects { display.refreshLanguage() }
            // A language choice never acknowledges or resets a privacy transition.
        case "enable":
            guard TVPublicFrame.keys(command, ["action", "enabled"]), let n = command["enabled"] as? NSNumber, CFGetTypeID(n) == CFBooleanGetTypeID() else { return state.detail }
            state.enable(n.boolValue); blank(); let (safe, connected, reason) = route(); routeState(safe: safe, connected: connected, reason: reason)
        case "ack":
            guard TVPublicFrame.keys(command, ["action", "epoch"]), let epoch = TVPublicFrame.integer(command["epoch"], minimum: 1) else { return state.detail }
            let (safe, connected, reason) = route(); routeState(safe: safe, connected: connected, reason: reason)
            state.ack(epoch, now: ProcessInfo.processInfo.systemUptime)
            startup.didAcknowledge(privateAllowed: state.privateAllowed)
        case "frame":
            guard TVPublicFrame.keys(command, ["action", "frame"]), let payload = command["frame"], let frame = TVPublicFrame.decode(payload) else { return state.detail }
            let (safe, connected, reason) = route(); routeState(safe: safe, connected: connected, reason: reason)
            if state.accept(frame, now: ProcessInfo.processInfo.systemUptime) { for display in displays.allObjects where display.outputAvailable { display.render(frame) } }
        default: return state.detail
        }
        publish(); return state.detail
    }
}
