import UIKit

// This scene owns only a native public canvas. No Capacitor, content dictionary or local storage.
final class TVExternalSceneDelegate: UIResponder, UIWindowSceneDelegate {
    var window: UIWindow?
    private(set) var outputAvailable = true
    private let canvas = TVPublicCanvas()
    func scene(_ scene: UIScene, willConnectTo session: UISceneSession, options connectionOptions: UIScene.ConnectionOptions) {
        let externalRole: Bool
        if #available(iOS 16.0, *) {
            externalRole = session.role == .windowExternalDisplay || session.role == .windowExternalDisplayNonInteractive
        } else {
            externalRole = session.role == .windowExternalDisplay
        }
        guard externalRole else { return }
        guard let scene = scene as? UIWindowScene else { return }
        let window = UIWindow(windowScene: scene)
        window.backgroundColor = .black
        let controller = UIViewController()
        controller.view = canvas
        window.rootViewController = controller
        self.window = window
        canvas.frame = window.bounds
        canvas.autoresizingMask = [.flexibleWidth, .flexibleHeight]
        render(nil)
        window.isHidden = false
        TVCoordinator.shared.externalConnected(self)
    }
    func sceneDidDisconnect(_ scene: UIScene) { outputAvailable = false; TVCoordinator.shared.externalDisconnected(self); window?.isHidden = true; window = nil }
    func sceneWillResignActive(_ scene: UIScene) { outputAvailable = false; render(nil); TVCoordinator.shared.transition("background") }
    func sceneDidEnterBackground(_ scene: UIScene) { outputAvailable = false; render(nil); TVCoordinator.shared.transition("background") }
    func sceneWillEnterForeground(_ scene: UIScene) { outputAvailable = true; TVCoordinator.shared.transition("reconnecting") }
    func sceneDidBecomeActive(_ scene: UIScene) { outputAvailable = true; TVCoordinator.shared.transition("reconnecting") }
    func windowScene(_ windowScene: UIWindowScene, didUpdate previousCoordinateSpace: UICoordinateSpace, interfaceOrientation previousInterfaceOrientation: UIInterfaceOrientation, traitCollection previousTraitCollection: UITraitCollection) { refreshGeometry() }
    @available(iOS 26.0, *)
    func windowScene(_ windowScene: UIWindowScene, didUpdateEffectiveGeometry previousEffectiveGeometry: UIWindowScene.Geometry) { refreshGeometry() }
    private func refreshGeometry() {
        // Check safety first; an unchanged route retains its current public frame.
        TVCoordinator.shared.geometryChanged()
        canvas.setNeedsDisplay()
        canvas.layer.displayIfNeeded()
    }
    func refreshLanguage() { canvas.setNeedsDisplay(); canvas.layer.displayIfNeeded() }
    func render(_ frame: TVPublicFrame?) {
        canvas.publicFrame = frame
        // Clear old-round pixels synchronously within the native turn, not only
        // when a later run-loop happens to service setNeedsDisplay.
        canvas.layer.displayIfNeeded()
    }
}

// Unknown scene roles can never instantiate the private application controller.
final class TVNeutralSceneDelegate: UIResponder, UIWindowSceneDelegate {
    var window: UIWindow?
    func scene(_ scene: UIScene, willConnectTo session: UISceneSession, options connectionOptions: UIScene.ConnectionOptions) {
        guard let scene = scene as? UIWindowScene else { return }
        let w = UIWindow(windowScene: scene), c = UIViewController()
        c.view.backgroundColor = .black
        w.rootViewController = c; window = w; w.isHidden = false
        TVCoordinator.shared.transition("route")
    }
}

final class TVPublicCanvas: UIView {
    var publicFrame: TVPublicFrame? { didSet { setNeedsDisplay() } }
    override init(frame: CGRect) { super.init(frame: frame); isOpaque = true; backgroundColor = UIColor(red: 0.96, green: 0.97, blue: 0.95, alpha: 1); accessibilityLabel = TVStrings.text("roundDrawing"); isAccessibilityElement = true }
    required init?(coder: NSCoder) { fatalError("Native public canvas only") }
    override func draw(_ rect: CGRect) {
        guard let ctx = UIGraphicsGetCurrentContext() else { return }
        // Compose in TV design points, not raw 4K pixels: text stays readable at distance.
        let scale = min(self.bounds.width / 1280, self.bounds.height / 720)
        guard scale > 0 else { return }
        ctx.saveGState(); defer { ctx.restoreGState() }
        ctx.scaleBy(x: scale, y: scale)
        let bounds = CGRect(x: 0, y: 0, width: self.bounds.width / scale, height: self.bounds.height / scale)
        UIColor(red: 0.82, green: 0.95, blue: 0.93, alpha: 1).setFill(); ctx.fill(bounds)
        UIColor(red: 0.70, green: 0.89, blue: 0.91, alpha: 1).setFill()
        ctx.fillEllipse(in: CGRect(x: -140, y: -180, width: 560, height: 560))
        UIColor(red: 1, green: 0.91, blue: 0.67, alpha: 1).setFill()
        ctx.fillEllipse(in: CGRect(x: bounds.maxX - 190, y: bounds.maxY - 160, width: 340, height: 340))
        func panel(_ rect: CGRect, _ color: UIColor, radius: CGFloat = 24) {
            ctx.saveGState()
            ctx.setShadow(offset: CGSize(width: 0, height: 6), blur: 0, color: UIColor(red: 0.14, green: 0.38, blue: 0.42, alpha: 0.16).cgColor)
            color.setFill(); UIBezierPath(roundedRect: rect, cornerRadius: radius).fill()
            ctx.restoreGState()
        }
        let ink = UIColor(red: 0.07, green: 0.24, blue: 0.33, alpha: 1)
        func text(_ text: String, _ rect: CGRect, _ size: CGFloat) {
            let p = NSMutableParagraphStyle(); p.alignment = .center
            p.lineBreakMode = .byTruncatingTail
            var fitted = size
            while fitted > 16 && (text as NSString).size(withAttributes: [.font: UIFont.systemFont(ofSize: fitted, weight: .bold)]).width > rect.width { fitted -= 1 }
            let base = UIFont.systemFont(ofSize: fitted, weight: .bold)
            let font = UIFont(descriptor: base.fontDescriptor.withDesign(.rounded) ?? base.fontDescriptor, size: fitted)
            (text as NSString).draw(in: rect, withAttributes: [.font: font, .foregroundColor: ink, .paragraphStyle: p])
        }
        accessibilityLabel = TVStrings.text("roundDrawing")
        guard let f = publicFrame, f.phase != "waiting" else {
            text(TVStrings.text("waitingTV"), bounds.insetBy(dx: 36, dy: bounds.height * 0.36), min(48, bounds.height / 13))
            return
        }
        let columns = min(f.scores.count, max(1, min(6, Int((bounds.width - 48) / 150))))
        let rows = Int(ceil(Double(f.scores.count) / Double(columns)))
        let answer = f.phase == "result" ? f.completedAnswer : ""
        let answerHeight: CGFloat = answer.isEmpty ? 0 : min(160, bounds.height * 0.22)
        let margin = max(20, bounds.width * 0.025), top: CGFloat = 72 + answerHeight, bottom: CGFloat = CGFloat(rows * 52 + 24)
        let width = min(bounds.width - margin * 2, max(0, bounds.height - top - bottom) * f.ratio)
        let resultLayout = f.phase == "result" ? TVResultLayout(bounds: bounds, ratio: f.ratio, scoreCount: f.scores.count) : nil
        let paper = resultLayout?.paper ?? CGRect(x: (bounds.width - width) / 2, y: top, width: width, height: width / f.ratio)
        let drawingWidth = paper.width
        panel(paper.insetBy(dx: -8, dy: -8), .white)
        UIColor.white.setFill(); ctx.fill(paper)
        ctx.saveGState(); ctx.clip(to: paper)
        for s in f.strokes {
            let hex = UInt32(s.color.dropFirst(), radix: 16) ?? 0
            let color = UIColor(red: CGFloat((hex >> 16) & 255) / 255, green: CGFloat((hex >> 8) & 255) / 255, blue: CGFloat(hex & 255) / 255, alpha: 1)
            ctx.setStrokeColor(color.cgColor); ctx.setFillColor(color.cgColor); ctx.setLineWidth(s.width * drawingWidth / 800); ctx.setLineCap(.round); ctx.setLineJoin(.round)
            let points = s.points.map { CGPoint(x: paper.minX + $0[0] * drawingWidth, y: paper.minY + $0[1] * paper.height) }
            guard let first = points.first else { continue }
            if points.count == 1 { let r = s.width * drawingWidth / 1600; ctx.fillEllipse(in: CGRect(x: first.x-r, y: first.y-r, width: r*2, height: r*2)); continue }
            ctx.beginPath(); ctx.move(to: first)
            if points.count > 2 { for i in 1..<(points.count-1) { ctx.addQuadCurve(to: CGPoint(x: (points[i].x + points[i+1].x)/2, y: (points[i].y + points[i+1].y)/2), control: points[i]) } }
            ctx.addLine(to: points.last!); ctx.strokePath()
        }
        ctx.restoreGState()
        text(f.phase == "drawing" ? "\(f.seconds) \(TVStrings.text("seconds", language: f.language))" : TVStrings.text("roundDrawing", language: f.language), CGRect(x: 20, y: 14, width: bounds.width-40, height: 54), 38)
        if !answer.isEmpty {
            // UIKit draws plain text; never interpret answer text as markup.
            let answerPanel = resultLayout?.answer ?? CGRect(x: margin, y: 68, width: bounds.width - margin * 2, height: answerHeight - 8)
            panel(answerPanel, UIColor(red: 1, green: 0.97, blue: 0.85, alpha: 1), radius: 20)
            let rect = answerPanel.insetBy(dx: 18, dy: 12)
            let paragraph = NSMutableParagraphStyle(); paragraph.alignment = .center
            var fontSize: CGFloat = 48
            while fontSize > 16 {
                let measured = (answer as NSString).boundingRect(with: CGSize(width: rect.width, height: .greatestFiniteMagnitude), options: [.usesLineFragmentOrigin, .usesFontLeading], attributes: [.font: UIFont.systemFont(ofSize: fontSize, weight: .bold), .paragraphStyle: paragraph], context: nil)
                if measured.height <= rect.height { break }
                fontSize -= 1
            }
            paragraph.lineBreakMode = .byTruncatingTail
            (answer as NSString).draw(with: rect, options: [.usesLineFragmentOrigin, .usesFontLeading], attributes: [.font: UIFont.systemFont(ofSize: fontSize, weight: .bold), .foregroundColor: ink, .paragraphStyle: paragraph], context: nil)
        }
        for (index, value) in f.scores.enumerated() {
            let defaultLabel = f.mode == "coop" ? TVStrings.text("solved", language: f.language) : f.mode == "teams" ? TVStrings.text("team", language: f.language) + " " + (index == 0 ? "A" : "B") : TVStrings.text("player", language: f.language) + " \(index+1)"
            let label = f.mode == "teams" && f.teamNames.indices.contains(index) && !f.teamNames[index].isEmpty ? f.teamNames[index] : defaultLabel
            let cell = resultLayout?.scores[index] ?? CGRect(x: 24 + CGFloat(index % columns) * ((bounds.width - 48) / CGFloat(columns)), y: paper.maxY + 12 + CGFloat(index / columns) * 52, width: (bounds.width - 48) / CGFloat(columns), height: 52)
            let cellWidth = cell.width
            if resultLayout != nil {
                let tile = cell.insetBy(dx: 7, dy: 8)
                let colors = [UIColor(red:0.91,green:0.99,blue:0.98,alpha:1), UIColor(red:1,green:0.91,blue:0.79,alpha:1), UIColor(red:0.94,green:0.89,blue:1,alpha:1)]
                panel(tile, colors[index % colors.count], radius: 20)
                let labelSize: CGFloat = f.scores.count <= 2 ? 32 : f.scores.count <= 4 ? 26 : 22
                let valueSize: CGFloat = f.scores.count <= 2 ? 76 : f.scores.count <= 4 ? 48 : 36
                let total = labelSize * 1.3 + valueSize * 1.2
                let y = tile.midY - total / 2
                text(label, CGRect(x:tile.minX+10,y:y,width:tile.width-20,height:labelSize*1.3), labelSize)
                text("\(value)", CGRect(x:tile.minX+10,y:y+labelSize*1.3,width:tile.width-20,height:valueSize*1.2), valueSize)
            } else {
                let x = cell.minX, y = cell.midY - 25
                text(label, CGRect(x:x,y:y,width:cellWidth,height:24), 20)
                text("\(value)", CGRect(x:x,y:y+24,width:cellWidth,height:30), 28)
            }
        }
    }
}
