import { useCallback, useEffect, useRef, useState, type RefObject } from 'react';
import { resolvePokemonRecognition, formatDexNumber, type PokemonRecognition } from '../lib/species';
import { TesseractOcrAdapter } from '../lib/ocr';
import type { OcrStatus } from '../types';

const SAMPLE_EVERY_MS = 240;
const OCR_COOLDOWN_MS = 1_050;
const STABLE_SAMPLES_REQUIRED = 4;

interface SourceRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

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

/**
 * Maps the visible operator-controlled OCR rectangle into raw camera pixels.
 * This deliberately makes no assumptions about a card's border, era, or layout.
 */
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

function preprocessCanvas(canvas: HTMLCanvasElement): HTMLCanvasElement {
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return canvas;

  const image = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const data = image.data;
  let total = 0;
  const luminances: number[] = [];

  for (let index = 0; index < data.length; index += 4) {
    const luminance = 0.2126 * data[index] + 0.7152 * data[index + 1] + 0.0722 * data[index + 2];
    luminances.push(luminance);
    total += luminance;
  }

  const mean = total / luminances.length;
  for (let index = 0, sampleIndex = 0; index < data.length; index += 4, sampleIndex += 1) {
    const normalized = clamp((luminances[sampleIndex] - mean) * 2.15 + 128, 0, 255);
    data[index] = normalized;
    data[index + 1] = normalized;
    data[index + 2] = normalized;
    data[index + 3] = 255;
  }

  ctx.putImageData(image, 0, 0);
  return canvas;
}

function getOperatorCrop(video: HTMLVideoElement, targetElement: HTMLElement): HTMLCanvasElement | null {
  const rect = mapElementRectToVideo(video, targetElement.getBoundingClientRect());
  if (!rect) return null;

  const scale = 4;
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(320, Math.round(rect.width * scale));
  canvas.height = Math.max(84, Math.round(rect.height * scale));
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return null;

  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(video, rect.x, rect.y, rect.width, rect.height, 0, 0, canvas.width, canvas.height);
  return preprocessCanvas(canvas);
}

function sampleSignature(canvas: HTMLCanvasElement): number[] {
  const sample = document.createElement('canvas');
  sample.width = 24;
  sample.height = 8;
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
  onResult,
}: {
  videoRef: RefObject<HTMLVideoElement | null>;
  cropTargetRef: RefObject<HTMLElement | null>;
  enabled: boolean;
  previewEnabled: boolean;
  onResult: (result: ScanRecognition) => void;
}) {
  const [status, setStatus] = useState<OcrStatus>('idle');
  const [preview, setPreview] = useState<OcrPreview | null>(null);
  const onResultRef = useRef(onResult);
  const adapterRef = useRef<TesseractOcrAdapter | null>(null);
  const previousSignatureRef = useRef<number[]>([]);
  const stableCountRef = useRef(0);
  const readingRef = useRef(false);
  const lastOcrAtRef = useRef(0);
  const initializedRef = useRef(false);

  useEffect(() => { onResultRef.current = onResult; }, [onResult]);

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
      const species = rawText ? resolvePokemonRecognition(rawText) : null;
      const displayText = species
        ? `${species.species.name} ${formatDexNumber(species.species.dex)}${species.confidence === 'medium' ? ' ?' : ''}`
        : rawText;

      initializedRef.current = true;
      setStatus('ready');

      if (previewEnabled) {
        setPreview({
          imageUrl: crop.toDataURL('image/png'),
          rawText: rawText || '—',
          canonicalText: species ? displayText : undefined,
          ocrConfidence: result.confidence,
          speciesScore: species?.score,
          runnerUp: species?.runnerUp
            ? `${species.runnerUp.name} (${Math.round(species.runnerUpScore * 100)}%)`
            : undefined,
        });
      }

      if (rawText) {
        onResultRef.current({
          rawText,
          displayText,
          ocrConfidence: result.confidence,
          crop: 'operator-zone',
          species: species ?? undefined,
        });
      }
    } catch {
      initializedRef.current = true;
      setStatus('ready');
    } finally {
      readingRef.current = false;
      lastOcrAtRef.current = Date.now();
    }
  }, [cropTargetRef, previewEnabled, videoRef]);

  useEffect(() => {
    if (!enabled) {
      previousSignatureRef.current = [];
      stableCountRef.current = 0;
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
      stableCountRef.current = isSimilarFrame(previousSignatureRef.current, signature)
        ? stableCountRef.current + 1
        : 0;
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

  useEffect(() => {
    if (!previewEnabled) setPreview(null);
  }, [previewEnabled]);

  return { status, preview, captureSample: runRecognition };
}
