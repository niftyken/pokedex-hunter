/**
 * OCR stays behind this small adapter contract so a later implementation can
 * swap Tesseract for a more card-specific recognizer without touching the scan UI.
 */
export interface OcrResult {
  text: string;
  confidence: number;
}

export interface OcrAdapter {
  readTitle(input: HTMLCanvasElement): Promise<OcrResult>;
  terminate(): Promise<void>;
}

/**
 * Lazily creates one English-only worker and reuses it for every title crop.
 * Reusing the worker is important: recreating it per frame would make the
 * scanner unusably slow and consume excessive memory on mobile browsers.
 */
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
          // Pokémon titles are predominantly Latin letters, digits, spaces,
          // punctuation, and the Nidoran gender symbols.
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
    return {
      text: String(result.data.text ?? '').replace(/\s+/g, ' ').trim(),
      confidence: Number(result.data.confidence ?? 0),
    };
  }

  async terminate(): Promise<void> {
    const workerPromise = this.workerPromise;
    this.workerPromise = null;
    if (!workerPromise) return;
    try {
      const worker = await workerPromise;
      await worker.terminate();
    } catch {
      // Worker startup can fail when a page is navigating away; no user-facing
      // error is necessary because this is only cleanup.
    }
  }
}
