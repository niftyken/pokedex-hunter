/** OCR adapter contract so another recognizer can replace Tesseract later. */
export interface OcrResult { text: string; confidence: number; }
export interface OcrAdapter { readTitle(input: HTMLCanvasElement): Promise<OcrResult>; terminate(): Promise<void>; }

/** Lazily creates one reusable English-only worker per active Scan session. */
export class TesseractOcrAdapter implements OcrAdapter {
  private workerPromise: Promise<any> | null = null;

  private async getWorker(): Promise<any> {
    if (!this.workerPromise) {
      this.workerPromise = (async () => {
        const { createWorker, PSM } = await import('tesseract.js');
        const worker = await createWorker('eng');
        await worker.setParameters({
          tessedit_pageseg_mode: PSM.SINGLE_LINE,
          preserve_interword_spaces: '1',
          // A narrow whitelist helps prevent decorative graphics from becoming
          // arbitrary Unicode. Gender symbols remain allowed, but the lexicon
          // can also resolve bare “Nidoran” when Tesseract misses the glyph.
          tessedit_char_whitelist: "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789 .,'’:&/-♀♂",
        });
        return worker;
      })();
    }
    return this.workerPromise;
  }

  async readTitle(input: HTMLCanvasElement): Promise<OcrResult> {
    const worker = await this.getWorker();
    const result = await worker.recognize(input);
    return { text: String(result.data.text ?? '').replace(/\s+/g, ' ').trim(), confidence: Number(result.data.confidence ?? 0) };
  }

  async terminate(): Promise<void> {
    const workerPromise = this.workerPromise;
    this.workerPromise = null;
    if (!workerPromise) return;
    try { await (await workerPromise).terminate(); } catch { /* cleanup only */ }
  }
}
