# Benefitsi Menü-Agent

- Profile: `benefitsi-menu`
- Runtime: existing M1 Hermes installation; MiniMax-M3.0
- Input: OCR text with page numbers, confidence and bounding boxes
- Output: structured menu draft for a human to review
- No tools, database rights, publication, memory or cross-request session reuse
- Original files are read locally by Apple Vision/PDFKit in temporary storage
- Only extracted text is sent to the configured model; no Gemini integration
