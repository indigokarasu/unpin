// Renders a local HTML file to a PNG at an exact size, so the store images are
// built from the extension's own stylesheet rather than redrawn by hand.
// Run: swift tools/shot.swift <page.html> <out.png> <width> <height>
import AppKit
import WebKit

let args = CommandLine.arguments
guard args.count == 5, let w = Double(args[3]), let h = Double(args[4]) else {
  FileHandle.standardError.write("usage: shot.swift <page.html> <out.png> <width> <height>\n".data(using: .utf8)!)
  exit(2)
}
let page = URL(fileURLWithPath: args[1]), out = URL(fileURLWithPath: args[2])

let app = NSApplication.shared
app.setActivationPolicy(.accessory)
// Store images are light; without this the snapshot follows this Mac's own
// appearance and the page's dark-mode rules fire.
app.appearance = NSAppearance(named: .aqua)

final class Shooter: NSObject, WKNavigationDelegate {
  let web: WKWebView
  let out: URL
  let size: CGSize
  init(size: CGSize, out: URL) {
    self.size = size
    self.out = out
    web = WKWebView(frame: CGRect(origin: .zero, size: size), configuration: WKWebViewConfiguration())
  }
  func webView(_ web: WKWebView, didFinish navigation: WKNavigation!) {
    // Let web fonts and layout settle before the snapshot.
    DispatchQueue.main.asyncAfter(deadline: .now() + 0.6) {
      let config = WKSnapshotConfiguration()
      config.rect = CGRect(origin: .zero, size: web.frame.size)
      // The page lays out at the size asked for; the snapshot comes back at
      // the screen's scale, so it is supersampled and shrunk on the way out.
      web.takeSnapshot(with: config) { image, error in
        guard let image, let cg = image.cgImage(forProposedRect: nil, context: nil, hints: nil) else {
          FileHandle.standardError.write("snapshot failed: \(error?.localizedDescription ?? "no image")\n".data(using: .utf8)!)
          exit(1)
        }
        let target = self.size
        let rep = NSBitmapImageRep(bitmapDataPlanes: nil, pixelsWide: Int(target.width), pixelsHigh: Int(target.height),
                                   bitsPerSample: 8, samplesPerPixel: 4, hasAlpha: true, isPlanar: false,
                                   colorSpaceName: .deviceRGB, bytesPerRow: 0, bitsPerPixel: 0)!
        NSGraphicsContext.saveGraphicsState()
        let ctx = NSGraphicsContext(bitmapImageRep: rep)!
        ctx.imageInterpolation = .high
        NSGraphicsContext.current = ctx
        NSImage(cgImage: cg, size: target).draw(in: CGRect(origin: .zero, size: target))
        NSGraphicsContext.restoreGraphicsState()
        guard let png = rep.representation(using: .png, properties: [:]) else {
          FileHandle.standardError.write("encoding failed\n".data(using: .utf8)!)
          exit(1)
        }
        try! png.write(to: self.out)
        exit(0)
      }
    }
  }
}

let shooter = Shooter(size: CGSize(width: w, height: h), out: out)  // CSS pixels
shooter.web.navigationDelegate = shooter
shooter.web.loadFileURL(page, allowingReadAccessTo: page.deletingLastPathComponent().deletingLastPathComponent())
app.run()
