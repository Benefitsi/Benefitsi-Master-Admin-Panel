import AppKit
import Foundation
import ImageIO
import PDFKit
import Vision

enum MenuError: Error { case unreadable, tooLarge }
let maxPages = 8
let maxEdge: CGFloat = 3000

func recognize(_ image: CGImage, page: Int) throws -> [String: Any] {
    let request = VNRecognizeTextRequest()
    request.recognitionLevel = .accurate
    request.usesLanguageCorrection = false
    request.recognitionLanguages = ["de-DE", "en-US", "fr-FR"]
    try VNImageRequestHandler(cgImage: image).perform([request])
    let observations = (request.results ?? []).sorted {
        if abs($0.boundingBox.midY - $1.boundingBox.midY) > 0.008 {
            return $0.boundingBox.midY > $1.boundingBox.midY
        }
        return $0.boundingBox.minX < $1.boundingBox.minX
    }
    if observations.isEmpty || observations.count > 1200 { throw MenuError.unreadable }
    let lines: [[String: Any]] = try observations.map { observation in
        guard let best = observation.topCandidates(1).first, !best.string.isEmpty else { throw MenuError.unreadable }
        let box = observation.boundingBox
        return ["text": best.string, "confidence": best.confidence,
                "x": box.minX, "y": box.minY, "width": box.width, "height": box.height]
    }
    return ["page": page, "lines": lines]
}

func extract(_ url: URL) throws -> [String: Any] {
    var pages: [[String: Any]] = []
    if url.pathExtension.lowercased() == "pdf" {
        guard let pdf = PDFDocument(url: url), !pdf.isLocked, pdf.pageCount > 0 else { throw MenuError.unreadable }
        guard pdf.pageCount <= maxPages else { throw MenuError.tooLarge }
        for index in 0..<pdf.pageCount {
            let result: [String: Any] = try autoreleasepool {
                guard let page = pdf.page(at: index) else { throw MenuError.unreadable }
                let bounds = page.bounds(for: .mediaBox)
                guard bounds.width > 0, bounds.height > 0, bounds.width.isFinite, bounds.height.isFinite else { throw MenuError.unreadable }
                let scale = maxEdge / max(bounds.width, bounds.height)
                let thumb = page.thumbnail(of: CGSize(width: bounds.width * scale, height: bounds.height * scale), for: .mediaBox)
                guard let image = thumb.cgImage(forProposedRect: nil, context: nil, hints: nil) else { throw MenuError.unreadable }
                return try recognize(image, page: index + 1)
            }
            pages.append(result)
        }
    } else {
        guard let source = CGImageSourceCreateWithURL(url as CFURL, nil), CGImageSourceGetCount(source) == 1 else { throw MenuError.unreadable }
        let options: [CFString: Any] = [kCGImageSourceCreateThumbnailFromImageAlways: true,
                                      kCGImageSourceCreateThumbnailWithTransform: true,
                                      kCGImageSourceThumbnailMaxPixelSize: Int(maxEdge)]
        guard let image = CGImageSourceCreateThumbnailAtIndex(source, 0, options as CFDictionary) else { throw MenuError.unreadable }
        pages.append(try recognize(image, page: 1))
    }
    return ["pages": pages]
}

do {
    guard CommandLine.arguments.count == 2 else { throw MenuError.unreadable }
    let result = try extract(URL(fileURLWithPath: CommandLine.arguments[1]))
    let data = try JSONSerialization.data(withJSONObject: result, options: [.sortedKeys])
    FileHandle.standardOutput.write(data)
} catch {
    FileHandle.standardError.write(Data("Menu OCR failed.\n".utf8))
    exit(1)
}
