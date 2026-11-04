import Foundation
import CoreGraphics
@main struct TVResultLayoutTests {
 static func main() {
  var count = 0
  for size in [CGSize(width:3840,height:2160),CGSize(width:1920,height:1080),CGSize(width:1280,height:720),CGSize(width:1024,height:768),CGSize(width:720,height:480)] {
   let scale = min(size.width / 1280, size.height / 720)
   let bounds = CGRect(x:0,y:0,width:size.width/scale,height:size.height/scale)
   for ratio in [1.0,4.0/3.0] { for players in 1...12 {
    let layout = TVResultLayout(bounds:bounds,ratio:ratio,scoreCount:players)
    precondition(bounds.contains(layout.paper) && bounds.contains(layout.answer))
    precondition(abs(layout.paper.width/layout.paper.height-CGFloat(ratio)) < 0.001)
    precondition(!layout.paper.intersects(layout.answer))
    precondition(layout.scores.count == players)
    for (i,cell) in layout.scores.enumerated() {
     precondition(bounds.contains(cell) && cell.minX > layout.answer.maxX)
     let label: CGFloat = players <= 2 ? 32 : players <= 4 ? 26 : 22
     let value: CGFloat = players <= 2 ? 76 : players <= 4 ? 48 : 36
     precondition(cell.height - 16 >= label * 1.3 + value * 1.2)
     precondition(value * scale / size.height >= 36.0 / 960.0)
     for j in 0..<i { precondition(!cell.insetBy(dx:0.1,dy:0.1).intersects(layout.scores[j])) }
    }; count += 1
   }}
  }; print("\(count) result layouts passed")
 }
}
