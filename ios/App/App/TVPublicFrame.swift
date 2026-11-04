import Foundation
import CoreGraphics
import CoreFoundation

// Public geometry and bounded completed-round text only; no private game snapshots.
struct TVStroke {
    let color: String
    let width: Double
    let points: [[Double]]
}
struct TVPublicFrame {
    let epoch: Int
    let seq: Int
    let round: Int
    let phase: String
    let ratio: Double
    let seconds: Int
    let mode: String
    let scores: [Int]
    let strokes: [TVStroke]
    let language: String
    let completedAnswer: String
    var teamNames: [String] = []

    static func number(_ value: Any?) -> Double? {
        guard let n = value as? NSNumber, CFGetTypeID(n) != CFBooleanGetTypeID() else { return nil }
        let d = n.doubleValue
        return d.isFinite ? d : nil
    }
    static func integer(_ value: Any?, minimum: Int = 0, maximum: Int = 9_007_199_254_740_991) -> Int? {
        guard let d = number(value), d.rounded() == d, d >= Double(minimum), d <= Double(maximum) else { return nil }
        return Int(d)
    }
    static func keys(_ object: [String: Any], _ expected: [String]) -> Bool { Set(object.keys) == Set(expected) }
    static func decode(_ value: Any) -> TVPublicFrame? {
        guard let d = value as? [String: Any],
              keys(d, ["v", "epoch", "seq", "round", "phase", "ratio", "seconds", "mode", "scores", "strokes", "language", "completedAnswer"] + (d["teamNames"] == nil ? [] : ["teamNames"])),
              JSONSerialization.isValidJSONObject(d),
              let encoded = try? JSONSerialization.data(withJSONObject: d), encoded.count <= 512_000,
              integer(d["v"]) == 2,
              let epoch = integer(d["epoch"], minimum: 1), let seq = integer(d["seq"], minimum: 1), let round = integer(d["round"]),
              let phase = d["phase"] as? String, ["waiting", "drawing", "result"].contains(phase),
              let completedAnswer = d["completedAnswer"] as? String, completedAnswer.utf16.count <= 512,
              (phase == "result" || completedAnswer.isEmpty),
              let ratio = number(d["ratio"]), ratio == 1 || ratio == 4.0 / 3.0,
              let seconds = integer(d["seconds"], maximum: 120),
              let mode = d["mode"] as? String, ["coop", "individual", "teams"].contains(mode),
              let language = d["language"] as? String, TVStrings.codes.contains(language),
              let values = d["scores"] as? [Any],
              (mode == "coop" ? values.count == 1 : mode == "teams" ? values.count == 2 : (1...12).contains(values.count)),
              let rawStrokes = d["strokes"] as? [Any], rawStrokes.count <= 400 else { return nil }
        var teamNames: [String] = []
        if let rawNames = d["teamNames"] {
            guard mode == "teams", let names = rawNames as? [String], names.count == 2,
                  names.allSatisfy({ $0.utf16.count <= 20 && $0.range(of: "[\\u0000-\\u001f\\u007f-\\u009f\\u202a-\\u202e\\u2066-\\u2069]", options: .regularExpression) == nil }) else { return nil }
            teamNames = names
        }
        let scores = values.compactMap { integer($0, maximum: 1000) }
        guard scores.count == values.count, phase != "waiting" || (rawStrokes.isEmpty && seconds == 0) else { return nil }
        var strokes: [TVStroke] = [], total = 0
        for item in rawStrokes {
            guard let s = item as? [String: Any], keys(s, ["color", "width", "points"]),
                  let color = s["color"] as? String, color.range(of: "^#[a-fA-F0-9]{6}$", options: .regularExpression) != nil,
                  let width = number(s["width"]), width > 0, width <= 24,
                  let raw = s["points"] as? [Any], (1...2000).contains(raw.count) else { return nil }
            total += raw.count
            guard total <= 12000 else { return nil }
            var points: [[Double]] = []
            for item in raw {
                guard let pair = item as? [Any], pair.count == 2,
                      let x = number(pair[0]), let y = number(pair[1]), (0...1).contains(x), (0...1).contains(y) else { return nil }
                points.append([x, y])
            }
            strokes.append(TVStroke(color: color, width: width, points: points))
        }
        return TVPublicFrame(epoch: epoch, seq: seq, round: round, phase: phase, ratio: ratio, seconds: seconds, mode: mode, scores: scores, strokes: strokes, language: language, completedAnswer: completedAnswer, teamNames: teamNames)
    }
}

// The first safe, TV-off neutral DOM acknowledgement is ordinary app loading.
// Later interruptions retain their explicit recovery reasons and require continuation.
struct TVStartupGate {
    private(set) var hasAcknowledged = false
    func reason(safe: Bool, enabled: Bool, observed: String) -> String {
        safe && !enabled && !hasAcknowledged ? "initializing" : observed
    }
    mutating func didAcknowledge(privateAllowed: Bool) {
        if privateAllowed { hasAcknowledged = true }
    }
}

struct TVPrivacyState {
    private(set) var enabled = false
    private(set) var connected = false
    private(set) var safe = false
    private(set) var epoch = 1
    private(set) var acknowledged = false
    private(set) var reason = "initializing"
    private(set) var seq = -1
    private(set) var round = 0
    private var lastFrame: TimeInterval?
    var privateAllowed: Bool { safe && (!enabled || connected) && acknowledged }
    var detail: [String: Any] { ["available": true, "enabled": enabled, "connected": connected, "privateAllowed": privateAllowed, "resetRequired": !acknowledged, "epoch": epoch, "reason": reason] }
    mutating func invalidate(reason: String) { epoch += 1; acknowledged = false; seq = -1; round = 0; lastFrame = nil; self.reason = reason }
    mutating func route(safe: Bool, connected: Bool, reason: String, force: Bool = false) {
        if force || self.safe != safe || self.connected != connected { invalidate(reason: reason) }
        self.safe = safe; self.connected = connected
        if !safe || (enabled && !connected) { self.reason = reason }
        else if acknowledged { self.reason = enabled ? "connected" : "off" }
    }
    mutating func enable(_ value: Bool) { if enabled != value { enabled = value; invalidate(reason: value ? (connected ? "reconnecting" : "waiting") : "off") } }
    mutating func ack(_ value: Int, now: TimeInterval) {
        guard value == epoch, safe, !enabled || connected else { return }
        acknowledged = true; lastFrame = now; reason = enabled ? "connected" : "off"
    }
    mutating func accept(_ f: TVPublicFrame, now: TimeInterval) -> Bool {
        guard enabled, connected, privateAllowed, f.epoch == epoch, f.seq > seq, f.round >= round else { return false }
        seq = f.seq; round = f.round; lastFrame = now; return true
    }
    mutating func expire(now: TimeInterval) -> Bool {
        guard enabled, connected, acknowledged, let lastFrame, now - lastFrame > 2.5 else { return false }
        invalidate(reason: "reconnecting"); return true
    }
}

// Fixed, bundled interface strings only; this catalog has no words, player names or saves.
enum TVStrings {
    static let codes: Set<String> = ["en-US", "en-GB", "pt-BR", "pt-PT", "es-ES", "es-MX", "en", "zh", "zh-TW", "zh-Hans", "ja", "ko", "de", "fr", "es", "pt", "it", "ar"]
    static func detect(_ preferences: [String]) -> String {
        for item in preferences {
            let value = item.replacingOccurrences(of: "_", with: "-").lowercased()
            if let exact = codes.first(where: { $0.lowercased() == value }) { return exact }
            if value.hasPrefix("zh-") && value.hasSuffix("-tw") { return "zh-TW" }
            if value.hasPrefix("zh") { return ["hant", "hk", "tw", "mo"].contains(where: { value.contains($0) }) ? "zh" : "zh-Hans" }
            let code = String(value.split(separator: "-").first ?? "en")
            if codes.contains(code) { return code }
        }
        return "en"
    }
    static var language = detect(Locale.preferredLanguages)
    private static let catalog: [String: [String: String]] = {
        guard let url = Bundle.main.url(forResource: "native-locales", withExtension: "json", subdirectory: "public/js"),
              let data = try? Data(contentsOf: url), let parsed = try? JSONDecoder().decode([String: [String: String]].self, from: data) else { return [:] }
        return parsed.filter { codes.contains($0.key) }
    }()
    static func text(_ key: String, language requested: String? = nil) -> String {
        let code = requested.flatMap { codes.contains($0) ? $0 : nil } ?? language
        return catalog[code]?[key] ?? catalog["en"]?[key] ?? "Sketch & Guess"
    }
}

// Public result composition: completed drawing/answer left, current scores right.
// Geometry is independent of UIKit so every supported score count can be tested.
struct TVResultLayout {
    let paper: CGRect
    let answer: CGRect
    let scores: [CGRect]
    init(bounds: CGRect, ratio: Double, scoreCount: Int) {
        let margin = max(20, bounds.width * 0.025)
        let gap = max(20, bounds.width * 0.025)
        let top: CGFloat = 80
        let contentHeight = max(1, bounds.height - top - margin)
        let rightWidth = (bounds.width - margin * 2 - gap) * 0.32
        let leftWidth = bounds.width - margin * 2 - gap - rightWidth
        let answerHeight = min(160, contentHeight * 0.25)
        let paperHeight = min(contentHeight - answerHeight - 12, leftWidth / CGFloat(ratio))
        let paperWidth = paperHeight * CGFloat(ratio)
        paper = CGRect(x: margin + (leftWidth - paperWidth) / 2, y: top, width: paperWidth, height: paperHeight)
        answer = CGRect(x: margin, y: paper.maxY + 12, width: leftWidth, height: answerHeight)
        let columns = scoreCount > 6 ? 2 : 1
        let rows = max(1, Int(ceil(Double(scoreCount) / Double(columns))))
        let cellHeight = min(scoreCount <= 2 ? 220 : 140, contentHeight / CGFloat(rows))
        let startY = top + (contentHeight - cellHeight * CGFloat(rows)) / 2
        scores = (0..<scoreCount).map { index in
            CGRect(x: margin + leftWidth + gap + CGFloat(index % columns) * rightWidth / CGFloat(columns),
                   y: startY + CGFloat(index / columns) * cellHeight,
                   width: rightWidth / CGFloat(columns), height: cellHeight)
        }
    }
}
