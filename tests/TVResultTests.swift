import Foundation
@main struct TVResultTests {
    static func main() {
        let source: [String: Any] = ["v":2,"epoch":1,"seq":1,"round":1,"phase":"result","ratio":1,"seconds":0,"mode":"coop","scores":[2],"strokes":[],"language":"en","completedAnswer":"Taxi · 的士"]
        precondition(TVPublicFrame.decode(source)?.completedAnswer == "Taxi · 的士")
        for phase in ["drawing", "waiting"] {
            var value = source; value["phase"] = phase
            precondition(TVPublicFrame.decode(value) == nil)
            value["completedAnswer"] = ""
            precondition(TVPublicFrame.decode(value)?.completedAnswer == "")
        }
        for bad in [String(repeating:"x",count:513),String(repeating:"😀",count:257)] {
            var value = source; value["completedAnswer"] = bad
            precondition(TVPublicFrame.decode(value) == nil)
        }
        var old = source; old["v"] = 1
        precondition(TVPublicFrame.decode(old) == nil)
        var state = TVPrivacyState()
        state.route(safe:true,connected:true,reason:"connected")
        state.enable(true);state.ack(state.epoch,now:0)
        var result = source;result["epoch"] = state.epoch
        precondition(state.accept(TVPublicFrame.decode(result)!,now:0.1))
        var waiting = result;waiting["seq"] = 2;waiting["phase"] = "waiting";waiting["completedAnswer"] = ""
        precondition(state.accept(TVPublicFrame.decode(waiting)!,now:0.2))
        precondition(!state.accept(TVPublicFrame.decode(result)!,now:0.3))
        state.invalidate(reason:"reconnecting")
        result["seq"] = 3
        precondition(!state.accept(TVPublicFrame.decode(result)!,now:0.4))
        var team = source; team["mode"] = "teams"; team["scores"] = [1,2]; team["teamNames"] = ["火龍隊", "Blue & Gold"]
        precondition(TVPublicFrame.decode(team)?.teamNames == ["火龍隊", "Blue & Gold"])
        for bad: Any in [["A"], ["A", String(repeating:"x",count:21)], ["A", "\n"], ["A", "\u{202e}"], ["A", 2]] {
            team["teamNames"] = bad; precondition(TVPublicFrame.decode(team) == nil)
        }
        team["teamNames"] = ["A", "B"];team["mode"] = "coop";team["scores"] = [0]
        precondition(TVPublicFrame.decode(team) == nil)
        print("19 completed-answer decoder and stale-frame checks passed")
    }
}
