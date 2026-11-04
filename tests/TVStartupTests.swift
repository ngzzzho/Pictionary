import Foundation

@main struct TVStartupTests {
    static func main() {
        var count = 0
        func check(_ condition: @autoclosure () -> Bool, _ label: String) { precondition(condition(), label); count += 1 }
        var startup = TVStartupGate()
        var state = TVPrivacyState()
        check(!startup.hasAcknowledged && !state.privateAllowed, "startup begins covered")
        check(startup.reason(safe: false, enabled: false, observed: "background") == "background", "pre-foreground remains covered")
        for reason in ["reconnecting", "route", "captured", "off", "initializing"] {
            check(startup.reason(safe: true, enabled: false, observed: reason) == "initializing", "safe initial route is loading")
        }
        for reason in ["captured", "route", "background"] {
            check(startup.reason(safe: false, enabled: false, observed: reason) == reason, "unsafe initial reason unchanged")
        }
        check(startup.reason(safe: true, enabled: true, observed: "waiting") == "waiting", "optional TV waiting stays explicit")
        state.route(safe: true, connected: false, reason: startup.reason(safe: true, enabled: false, observed: "reconnecting"), force: true)
        check(state.reason == "initializing" && !state.privateAllowed, "first foreground waits for neutral DOM")
        state.ack(state.epoch - 1, now: 0)
        startup.didAcknowledge(privateAllowed: state.privateAllowed)
        check(!startup.hasAcknowledged && !state.privateAllowed, "stale ack cannot finish startup")
        state.ack(state.epoch, now: 0)
        startup.didAcknowledge(privateAllowed: state.privateAllowed)
        check(startup.hasAcknowledged && state.privateAllowed, "fresh safe neutral ack finishes startup")
        let readyEpoch = state.epoch
        for _ in 0..<10 { state.route(safe: true, connected: false, reason: "off") }
        check(state.epoch == readyEpoch && state.privateAllowed, "unchanged startup geometry does not interrupt Home")
        state.route(safe: false, connected: false, reason: "route")
        check(state.epoch > readyEpoch && !state.privateAllowed, "geometry with an unsafe route covers immediately")
        state.route(safe: true, connected: false, reason: "off")
        check(!state.privateAllowed, "restored route still needs neutral acknowledgment")
        state.ack(state.epoch, now: 1)
        let recoveredEpoch = state.epoch
        state.route(safe: true, connected: true, reason: "off")
        check(state.epoch > recoveredEpoch && !state.privateAllowed, "geometry with a connection change requires acknowledgment")
        state.route(safe: true, connected: false, reason: "off")
        state.ack(state.epoch, now: 1)
        for reason in ["reconnecting", "captured", "route", "background", "off"] {
            check(startup.reason(safe: true, enabled: false, observed: reason) == reason, "later interruption remains explicit")
        }
        state.route(safe: false, connected: false, reason: "captured", force: true)
        state.ack(state.epoch, now: 1)
        check(!state.privateAllowed, "capture remains covered even after startup")
        state.route(safe: true, connected: false, reason: startup.reason(safe: true, enabled: false, observed: "reconnecting"), force: true)
        check(state.reason == "reconnecting" && !state.privateAllowed, "post-exposure reconnect needs fresh neutral ack")
        state.ack(state.epoch, now: 2)
        check(state.privateAllowed, "post-exposure valid ack can recover")
        state.enable(true)
        state.route(safe: true, connected: false, reason: "waiting")
        state.ack(state.epoch, now: 3)
        check(!state.privateAllowed && state.reason == "waiting", "TV without public screen stays covered")
        state.route(safe: true, connected: true, reason: "connected")
        state.ack(state.epoch, now: 4)
        let connectedEpoch = state.epoch
        for _ in 0..<10 { state.route(safe: true, connected: true, reason: "connected") }
        check(state.epoch == connectedEpoch && state.privateAllowed, "external geometry and appearance keep an acknowledged TV route")
        state.route(safe: false, connected: true, reason: "captured")
        check(state.epoch > connectedEpoch && !state.privateAllowed, "actual capture after geometry still covers TV")
        state.route(safe: true, connected: false, reason: "waiting")
        state.ack(state.epoch, now: 5)
        check(!state.privateAllowed, "actual disconnection cannot be acknowledged away")
        var capturedStartup = TVStartupGate()
        var captured = TVPrivacyState()
        captured.route(safe: false, connected: false, reason: "captured", force: true)
        captured.ack(captured.epoch, now: 0)
        capturedStartup.didAcknowledge(privateAllowed: captured.privateAllowed)
        check(!capturedStartup.hasAcknowledged && !captured.privateAllowed, "unsafe first launch never acknowledges")
        print("TV startup tests passed: \(count)")
    }
}
