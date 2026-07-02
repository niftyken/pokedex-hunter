# Phase 2 install

This source update adds live English-only OCR via Tesseract.js.

In the Codespaces terminal from the existing repository root:

1. Copy the contents of this package into the existing checkout, replacing matching files.
2. Run `npm install` to add `tesseract.js` and refresh `package-lock.json`.
3. Run `npm run build`.
4. Run `npm run dev`.
5. In Settings, turn **Developer demo OCR** off to activate live camera OCR.

The first live OCR session downloads the English OCR worker/language resources; later reads reuse one worker for the session. It intentionally OCRs a narrow central title crop only and waits for several similar frames before recognizing.
