// Renders the Unpin icon: a red disc holding a white "p" whose descender is a
// downward arrow. Geometry is in a 128-unit square and scaled to each size.
// Run: swift tools/icon.swift  (writes icons/icon-{16,32,48,128}.png)
import AppKit

let red = CGColor(red: 0xE6/255, green: 0x00/255, blue: 0x23/255, alpha: 1)
let white = CGColor(red: 1, green: 1, blue: 1, alpha: 1)

func render(_ px: Int) -> Data {
  let cs = CGColorSpace(name: CGColorSpace.sRGB)!
  let ctx = CGContext(data: nil, width: px, height: px, bitsPerComponent: 8, bytesPerRow: 0,
                      space: cs, bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue)!
  let s = CGFloat(px) / 128
  // Flip to a y-down coordinate system so the numbers read like SVG.
  ctx.translateBy(x: 0, y: CGFloat(px)); ctx.scaleBy(x: s, y: -s)

  ctx.setFillColor(red)
  ctx.fillEllipse(in: CGRect(x: 0, y: 0, width: 128, height: 128))

  // Small sizes get a heavier stroke so the letter survives the toolbar.
  let w: CGFloat = px <= 16 ? 17 : px <= 32 ? 15.5 : 14
  // stemX is placed so the glyph (arrow tip to bowl edge) is optically centred.
  let stemX: CGFloat = 53, top: CGFloat = 30, bowlR: CGFloat = 19
  ctx.setStrokeColor(white); ctx.setLineWidth(w); ctx.setLineCap(.butt)

  // Bowl: a ring whose left edge is the stem.
  ctx.strokeEllipse(in: CGRect(x: stemX, y: top, width: bowlR * 2, height: bowlR * 2))
  // Stem, from the top of the bowl down into the arrowhead.
  ctx.move(to: CGPoint(x: stemX, y: top - w / 2 + 0.5)); ctx.addLine(to: CGPoint(x: stemX, y: 84)); ctx.strokePath()
  // Arrowhead. At 16px a true-to-scale head is two pixels wide and reads as a
  // plain "p", so the smallest size gets a broader one.
  let head: CGFloat = px <= 16 ? 25 : 20, tip: CGFloat = px <= 16 ? 108 : 104
  ctx.setFillColor(white)
  ctx.move(to: CGPoint(x: stemX - head, y: 80)); ctx.addLine(to: CGPoint(x: stemX + head, y: 80))
  ctx.addLine(to: CGPoint(x: stemX, y: tip)); ctx.closePath(); ctx.fillPath()

  let rep = NSBitmapImageRep(cgImage: ctx.makeImage()!)
  return rep.representation(using: .png, properties: [:])!
}

let dir = URL(fileURLWithPath: CommandLine.arguments.count > 1 ? CommandLine.arguments[1] : "icons")
for px in [16, 32, 48, 128, 512] {
  try! render(px).write(to: dir.appendingPathComponent("icon-\(px).png"))
}
