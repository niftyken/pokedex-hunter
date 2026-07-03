import { useCallback, useEffect, useRef, useState, type RefObject } from 'react';
import { resolvePokemonRecognition, formatDexNumber, type PokemonRecognition } from '../lib/species';
import { TesseractOcrAdapter } from '../lib/ocr';
import type { OcrStatus } from '../types';

// Handheld-oriented cadence: the camera is sampled frequently enough to notice
// when a card settles, but costly OCR is attempted no more than about once per
// 0.9 seconds. A candidate must agree in two of the most recent three reads.
const SAMPLE_EVERY_MS = 260;
const OCR_COOLDOWN_MS = 900;
const STABLE_SAMPLES_REQUIRED = 3;
const AGREEMENT_WINDOW = 3;
const AGREEMENT_REQUIRED = 2;

interface SourceRect { x: number; y: number; width: number; height: number; }

export interface ScanRecognition {
  rawText: string;
  displayText: string;
  ocrConfidence: number;
  crop: 'operator-zone';
  species?: PokemonRecognition;
}

export interface OcrPreview {
  imageUrl: string;
  rawText: string;
  canonicalText?: string;
  ocrConfidence: number;
  speciesScore?: number;
  runnerUp?: string;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function mapElementRectToVideo(video: HTMLVideoElement, targetRect: DOMRect): SourceRect | null {
  if (!video.videoWidth || !video.videoHeight) return null;
  const videoRect = video.getBoundingClientRect();
  const sourceWidth = video.videoWidth;
  const sourceHeight = video.videoHeight;
  const boxRatio = videoRect.width / videoRect.height;
  const videoRatio = sourceWidth / sourceHeight;
  let renderedWidth = videoRect.width;
  let renderedHeight = videoRect.height;
  let offsetX = 0;
  let offsetY = 0;

  if (videoRatio > boxRatio) {
    renderedHeight = videoRect.height;
    renderedWidth = renderedHeight * videoRatio;
    offsetX = (videoRect.width - renderedWidth) / 2;
  } else {
    renderedWidth = videoRect.width;
    renderedHeight = renderedWidth / videoRatio;
    offsetY = (videoRect.height - renderedHeight) / 2;
  }

  const x = ((targetRect.left - videoRect.left - offsetX) / renderedWidth) * sourceWidth;
  const y = ((targetRect.top - videoRect.top - offsetY) / renderedHeight) * sourceHeight;
  const width = (targetRect.width / renderedWidth) * sourceWidth;
  const height = (targetRect.height / renderedHeight) * sourceHeight;
  const clampedX = clamp(x, 0, sourceWidth - 1);
  const clampedY = clamp(y, 0, sourceHeight - 1);
  return {
    x: clampedX,
    y: clampedY,
    width: clamp(width, 1, sourceWidth - clampedX),
    height: clamp(height, 1, sourceHeight - clampedY),
  };
}

function trimInnerEdges(rect: SourceRect): SourceRect {
  // Exclude a small safety margin so the scan box may visibly touch a card's
  // frame without feeding its border lines directly into Tesseract.
  const insetX = rect.width * 0.028;
  const insetY = rect.height * 0.11;
  return {
    x: rect.x + insetX,
    y: rect.y + insetY,
    width: Math.max(1, rect.width - insetX * 2),
    height: Math.max(1, rect.height - insetY * 2),
  };
}

function preprocessCanvas(canvas: HTMLCanvasElement): HTMLCanvasElement {
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return canvas;
  const image = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const { data } = image;
  const luma = new Uint8Array(canvas.width * canvas.height);
  let total = 0;

  for (let pixel = 0, index = 0; index < data.length; index += 4, pixel += 1) {
    const value = Math.round(0.2126 * data[index] + 0.7152 * data[index + 1] + 0.0722 * data[index + 2]);
    luma[pixel] = value;
    total += value;
  }

  const mean = total / luma.length;
  for (let pixel = 0, index = 0; index < data.length; index += 4, pixel += 1) {
    const normalized = clamp(Math.round((luma[pixel] - mean) * 2.85 + 132), 0, 255);
    data[index] = normalized;
    data[index + 1] = normalized;
    data[index + 2] = normalized;
    data[index + 3] = 255;
  }

  // Remove only nearly full-width dark rows. These are commonly card rules or
  // borders; actual letter rows never occupy most of a wide name strip.
  for (let y = 0; y < canvas.height; y += 1) {
    let dark = 0;
    for (let x = 0; x < canvas.width; x += 1) if (data[(y * canvas.width + x) * 4] < 72) dark += 1;
    if (dark / canvas.width > 0.74) {
      for (let x = 0; x < canvas.width; x += 1) {
        const index = (y * canvas.width + x) * 4;
        data[index] = 255; data[index + 1] = 255; data[index + 2] = 255;
      }
    }
  }

  ctx.putImageData(image, 0, 0);
  return canvas;
}

function getOperatorCrop(video: HTMLVideoElement, targetElement: HTMLElement): HTMLCanvasElement | null {
  const mapped = mapElementRectToVideo(video, targetElement.getBoundingClientRect());
  if (!mapped) return null;
  const rect = trimInnerEdges(mapped);
  const scale = 4;
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(360, Math.round(rect.width * scale));
  canvas.height = Math.max(72, Math.round(rect.height * scale));
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return null;
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(video, rect.x, rect.y, rect.width, rect.height, 0, 0, canvas.width, canvas.height);
  return preprocessCanvas(canvas);
}

function sampleSignature(canvas: HTMLCanvasElement): number[] {
  const sample = document.createElement('canvas');
  sample.width = 24; sample.height = 8;
  const ctx = sample.getContext('2d', { willReadFrequently: true });
  if (!ctx) return [];
  ctx.drawImage(canvas, 0, 0, sample.width, sample.height);
  const data = ctx.getImageData(0, 0, sample.width, sample.height).data;
  const values: number[] = [];
  for (let index = 0; index < data.length; index += 4) values.push(data[index]);
  return values;
}

function isSimilarFrame(previous: number[], current: number[]): boolean {
  if (!previous.length || previous.length !== current.length) return false;
  let difference = 0;
  for (let index = 0; index < previous.length; index += 1) difference += Math.abs(previous[index] - current[index]);
  return difference / previous.length < 9;
}

export function useTitleOcr({
  videoRef,
  cropTargetRef,
  enabled,
  previewEnabled,
  preferredNames,
  onResult,
  onScanning,
}: {
  videoRef: RefObject<HTMLVideoElement | null>;
  cropTargetRef: RefObject<HTMLElement | null>;
  enabled: boolean;
  previewEnabled: boolean;
  preferredNames: readonly string[];
  onResult: (result: ScanRecognition) => void;
  onScanning: () => void;
}) {
  const [status, setStatus] = useState<OcrStatus>('idle');
  const [preview, setPreview] = useState<OcrPreview | null>(null);
  const onResultRef = useRef(onResult);
  const onScanningRef = useRef(onScanning);
  const preferredNamesRef = useRef(preferredNames);
  const adapterRef = useRef<TesseractOcrAdapter | null>(null);
  const previousSignatureRef = useRef<number[]>([]);
  const stableCountRef = useRef(0);
  const readingRef = useRef(false);
  const lastOcrAtRef = useRef(0);
  const initializedRef = useRef(false);
  const agreementRef = useRef<string[]>([]);
  const lastEmittedKeyRef = useRef('');

  useEffect(() => { onResultRef.current = onResult; }, [onResult]);
  useEffect(() => { onScanningRef.current = onScanning; }, [onScanning]);
  useEffect(() => { preferredNamesRef.current = preferredNames; }, [preferredNames]);

  const runRecognition = useCallback(async () => {
    const video = videoRef.current;
    const cropTarget = cropTargetRef.current;
    const adapter = adapterRef.current;
    if (!video || !cropTarget || !adapter || readingRef.current || video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) return;
    const crop = getOperatorCrop(video, cropTarget);
    if (!crop) return;

    readingRef.current = true;
    setStatus(initializedRef.current ? 'reading' : 'warming');
    try {
      const result = await adapter.readTitle(crop);
      const rawText = result.text.trim();
      const species = rawText ? resolvePokemonRecognition(rawText, preferredNamesRef.current) : null;
      const displayText = species
        ? `${species.species.name} ${formatDexNumber(species.species.dex)}${species.confidence === 'medium' ? ' ?' : ''}`
        : '';
      initializedRef.current = true;
      setStatus('ready');

      if (previewEnabled) {
        setPreview({
          imageUrl: crop.toDataURL('image/png'),
          rawText: rawText || '—',
          canonicalText: species ? displayText : undefined,
          ocrConfidence: result.confidence,
          speciesScore: species?.score,
          runnerUp: species?.runnerUp ? `${species.runnerUp.name} (${Math.round(species.runnerUpScore * 100)}%)` : undefined,
        });
      }

      if (!species) {
        agreementRef.current = [];
        lastEmittedKeyRef.current = '';
        onScanningRef.current();
        return;
      }

      const key = String(species.species.dex);
      agreementRef.current = [...agreementRef.current, key].slice(-AGREEMENT_WINDOW);
      const agreements = agreementRef.current.filter((candidate) => candidate === key).length;
      if (agreements < AGREEMENT_REQUIRED) {
        onScanningRef.current();
        return;
      }

      if (lastEmittedKeyRef.current === key) return;
      lastEmittedKeyRef.current = key;
      onResultRef.current({ rawText, displayText, ocrConfidence: result.confidence, crop: 'operator-zone', species });
    } catch {
      initializedRef.current = true;
      setStatus('ready');
      onScanningRef.current();
    } finally {
      readingRef.current = false;
      lastOcrAtRef.current = Date.now();
    }
  }, [cropTargetRef, previewEnabled, videoRef]);

  useEffect(() => {
    if (!enabled) {
      previousSignatureRef.current = [];
      stableCountRef.current = 0;
      agreementRef.current = [];
      lastEmittedKeyRef.current = '';
      initializedRef.current = false;
      setStatus('idle');
      return;
    }

    const adapter = new TesseractOcrAdapter();
    adapterRef.current = adapter;
    let cancelled = false;
    const timer = window.setInterval(() => {
      const video = videoRef.current;
      const cropTarget = cropTargetRef.current;
      if (cancelled || readingRef.current || !video || !cropTarget || video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) return;
      const crop = getOperatorCrop(video, cropTarget);
      if (!crop) return;
      const signature = sampleSignature(crop);
      stableCountRef.current = isSimilarFrame(previousSignatureRef.current, signature) ? stableCountRef.current + 1 : 0;
      previousSignatureRef.current = signature;
      const now = Date.now();
      if (stableCountRef.current < STABLE_SAMPLES_REQUIRED || now - lastOcrAtRef.current < OCR_COOLDOWN_MS) return;
      void runRecognition();
    }, SAMPLE_EVERY_MS);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
      readingRef.current = false;
      adapterRef.current = null;
      void adapter.terminate();
    };
  }, [cropTargetRef, enabled, runRecognition, videoRef]);

  useEffect(() => { if (!previewEnabled) setPreview(null); }, [previewEnabled]);
  return { status, preview, captureSample: runRecognition };
}
