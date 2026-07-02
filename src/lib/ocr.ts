/**
 * Future OCR adapters should implement this small contract. The scan surface can
 * hand an adapter a title-region canvas/blob after stability checks, without
 * knowing whether the implementation is Tesseract.js, a native API, or a mock.
 */
export interface OcrAdapter {
  readTitle(input: Blob | HTMLCanvasElement): Promise<{ text: string; confidence: number }>;
}

export class MockOcrAdapter implements OcrAdapter {
  async readTitle(): Promise<{ text: string; confidence: number }> {
    return { text: '', confidence: 0 };
  }
}
