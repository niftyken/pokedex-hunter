import { useCallback, useEffect, useRef, useState, type RefObject } from 'react';
import { findWantedMatch } from '../lib/matching';
import { formatDexNumber, resolvePokemonRecognition, type PokemonRecognition } from '../lib/species';
import { TesseractOcrAdapter } from '../lib/ocr';
import type { OcrStatus, Sensitivity } from '../types';

const SAMPLE_EVERY_MS = 240;
const OCR_COOLDOWN_MS = 1_050;
const STABLE_SAMPLES_REQUIRED = 4;

interface CropAttempt {
  canvas: HTMLCanvasElement;
  label: string;
}

interface SourceRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface OcrDebugCandidate {
  label: string;
  imageUrl: string;
  text: string;
  confidence: number;
  selected: boolean;
  directWantedMatch: boolean;
  canonicalText?: string;
  speciesScore?: number;
  runnerUp?: string;
}

export interface ScanRecognition {
  rawText: string;
  displayText: string;
  ocrConfidence: number;
  crop: string;
  species?: PokemonRecognition;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function getRenderedVideoMetrics(video: HTMLVideoElement) {
  const rect = video.getBoundingClientRect();
  const sourceWidth = video.videoWidth;
  const sourceHeight = video.videoHeight;
  const boxRatio = rect.width / rect.height;
  const videoRatio = sourceWidth / sourceHeight;

  let renderedWidth = rect.width;
  let renderedHeight = rect.height;
  let offsetX = 0;
  let offsetY = 0;

  if (videoRatio > boxRatio) {
    renderedHeight = rect.height;
    renderedWidth = renderedHeight * videoRatio;
    offsetX = (rect.width - renderedWidth) / 2;
  } else {
    renderedWidth = rect.width;
    renderedHeight = renderedWidth / videoRatio;
    offsetY = (rect.height - renderedHeight) / 2;
  }

  return { rect, sourceWidth, sourceHeight, renderedWidth, renderedHeight, offsetX, offsetY };
}

function mapElementRectToVideo(video: HTMLVideoElement, targetRect: DOMRect): SourceRect | null {
  if (!video.videoWidth || !video.videoHeight) return null;

  const metrics = getRenderedVideoMetrics(video);
  const leftInRendered = targetRect.left - metrics.rect.left - metrics.offsetX;
  const topInRendered = targetRect.top - metrics.rect.top - metrics.offsetY;

  const x = (leftInRendered / metrics.renderedWidth) * metrics.sourceWidth;
  const y = (topInRendered / metrics.renderedHeight) * metrics.sourceHeight;
  const width = (targetRect.width / metrics.renderedWidth) * metrics.sourceWidth;
  const height = (targetRect.height / metrics.renderedHeight) * metrics.sourceHeight;

  const clampedX = clamp(x, 0, metrics.sourceWidth - 1);
  const clampedY = clamp(y, 0, metrics.sourceHeight - 1);
  const clampedWidth = clamp(width, 1, metrics.sourceWidth - clampedX);
  const clampedHeight = clamp(height, 1, metrics.sourceHeight - clampedY);
  return { x: clampedX, y: clampedY, width: clampedWidth, height: clampedHeight };
}

function preprocessTitleCanvas(canvas: HTMLCanvasElement, threshold: boolean): HTMLCanvasElement {
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
  const thresholdValue = mean > 155 ? 185 : mean > 120 ? 168 : 152;
  for (let index = 0, sampleIndex = 0; index < data.length; index += 4, sampleIndex += 1) {
    const normalized = clamp((luminances[sampleIndex] - mean) * 2.15 + 128, 0, 255);
    const output = threshold ? (normalized > thresholdValue ? 255 : 0) : normalized;
    data[index] = output;
    data[index + 1] = output;
    data[index + 2] = output;
    data[index + 3] = 255;
  }

  ctx.putImageData(image, 0, 0);
  return canvas;
}

function buildCropCanvas(video: HTMLVideoElement, source: SourceRect, threshold: boolean): HTMLCanvasElement {
  const scale = 4;
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(260, Math.round(source.width * scale));
  canvas.height = Math.max(64, Math.round(source.height * scale));
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return canvas;

  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(video, source.x, source.y, source.width, source.height, 0, 0, canvas.width, canvas.height);
  return preprocessTitleCanvas(canvas, threshold);
}

/**
 * The target zone spans almost the full printed title row. Candidate strips
 * intentionally overlap: vintage cards need more left room; modern cards often
 * have a left-side icon; all avoid the far-right HP/type area.
 */
function getTitleCropAttempts(video: HTMLVideoElement, targetElement: HTMLElement): CropAttempt[] {
  const titleBand = mapElementRectToVideo(video, targetElement.getBoundingClientRect());
  if (!titleBand) return [];

  const variants = [
    { label: 'vintage-wide', left: 0.0, right: 0.88, threshold: false },
    { label: 'modern', left: 0.15, right: 0.86, threshold: false },
    { label: 'center-threshold', left: 0.06, right: 0.80, threshold: true },
  ];

  return variants.map((variant) => {
    const x = titleBand.x + titleBand.width * variant.left;
    const width = titleBand.width * (variant.right - variant.left);
    const clampedX = clamp(x, 0, video.videoWidth - 1);
    const source: SourceRect = {
      x: clampedX,
      y: titleBand.y,
      width: clamp(width, 1, video.videoWidth - clampedX),
      height: titleBand.height,
    };
    return { canvas: buildCropCanvas(video, source, variant.threshold), label: variant.label };
  });
}

function sampleSignature(canvas: HTMLCanvasElement): number[] {
  const sample = document.createElement('canvas');
  sample.width = 20;
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
  debugEnabled,
  wantedList,
  sensitivity,
  onResult,
}: {
  videoRef: RefObject<HTMLVideoElement | null>;
  cropTargetRef: RefObject<HTMLElement | null>;
  enabled: boolean;
  debugEnabled: boolean;
  wantedList: string[];
  sensitivity: Sensitivity;
  onResult: (result: ScanRecognition) => void;
}) {
  const [status, setStatus] = useState<OcrStatus>('idle');
  const [debugCandidates, setDebugCandidates] = useState<OcrDebugCandidate[]>([]);
  const [lastResult, setLastResult] = useState<ScanRecognition | null>(null);
  const onResultRef = useRef(onResult);
  const adapterRef = useRef<TesseractOcrAdapter | null>(null);
  const previousSignatureRef = useRef<number[]>([]);
  const stableCountRef = useRef(0);
  const readingRef = useRef(false);
  const lastOcrAtRef = useRef(0);
  const initializedRef = useRef(false);

  useEffect(() => { onResultRef.current = onResult; }, [onResult]);

  const runRecognition = useCallback(async (isManual: boolean) => {
    const video = videoRef.current;
    const cropTarget = cropTargetRef.current;
    const adapter = adapterRef.current;
    if (!video || !cropTarget || !adapter || readingRef.current || video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) return;

    const attempts = getTitleCropAttempts(video, cropTarget);
    if (!attempts.length) return;

    readingRef.current = true;
    setStatus(initializedRef.current ? 'reading' : 'warming');

    try {
      const evaluated = [] as Array<{
        attempt: CropAttempt;
        text: string;
        confidence: number;
        recognition: PokemonRecognition | null;
        directWantedMatch: boolean;
        score: number;
      }>;

      for (const attempt of attempts) {
        const result = await adapter.readTitle(attempt.canvas);
        const text = result.text.trim();
        const recognition = text ? resolvePokemonRecognition(text) : null;
        const canonicalName = recognition?.species.name ?? text;
        const match = canonicalName ? findWantedMatch(canonicalName, wantedList, sensitivity, result.confidence) : null;
        const directWantedMatch = Boolean(match?.isDirectMatch && recognition);

        // A plausible closed-lexicon species recognition is more useful than a
        // generic OCR string; an active Wanted List match is still decisive.
        const speciesBonus = recognition
          ? (recognition.confidence === 'high' ? 2_400 : 1_200) + recognition.score * 100
          : 0;
        const matchBonus = directWantedMatch ? 10_000 : match ? 800 : 0;
        const score = matchBonus + speciesBonus + result.confidence + Math.min(18, text.length);
        evaluated.push({ attempt, text, confidence: result.confidence, recognition, directWantedMatch, score });
      }

      const best = evaluated.reduce<typeof evaluated[number] | null>((currentBest, candidate) => (
        !currentBest || candidate.score > currentBest.score ? candidate : currentBest
      ), null);

      initializedRef.current = true;
      setStatus('ready');
      if (!best) return;

      if (debugEnabled || isManual) {
        setDebugCandidates(evaluated.map((candidate) => ({
          label: candidate.attempt.label,
          imageUrl: candidate.attempt.canvas.toDataURL('image/png'),
          text: candidate.text || '—',
          confidence: candidate.confidence,
          selected: candidate.attempt.label === best.attempt.label,
          directWantedMatch: candidate.directWantedMatch,
          canonicalText: candidate.recognition
            ? `${candidate.recognition.species.name} ${formatDexNumber(candidate.recognition.species.dex)}${candidate.recognition.confidence === 'medium' ? ' ?' : ''}`
            : undefined,
          speciesScore: candidate.recognition?.score,
          runnerUp: candidate.recognition?.runnerUp
            ? `${candidate.recognition.runnerUp.name} (${Math.round(candidate.recognition.runnerUpScore * 100)}%)`
            : undefined,
        })));
      }

      if (best.text) {
        const scanRecognition: ScanRecognition = {
          rawText: best.text,
          displayText: best.recognition
            ? `${best.recognition.species.name} ${formatDexNumber(best.recognition.species.dex)}${best.recognition.confidence === 'medium' ? ' ?' : ''}`
            : best.text,
          ocrConfidence: best.confidence,
          crop: best.attempt.label,
          species: best.recognition ?? undefined,
        };
        setLastResult(scanRecognition);
        onResultRef.current(scanRecognition);
      }
    } catch {
      initializedRef.current = true;
      setStatus('ready');
    } finally {
      readingRef.current = false;
      lastOcrAtRef.current = Date.now();
    }
  }, [cropTargetRef, debugEnabled, sensitivity, videoRef, wantedList]);

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

      const baseAttempt = getTitleCropAttempts(video, cropTarget)[0];
      if (!baseAttempt) return;
      const signature = sampleSignature(baseAttempt.canvas);
      stableCountRef.current = isSimilarFrame(previousSignatureRef.current, signature)
        ? stableCountRef.current + 1
        : 0;
      previousSignatureRef.current = signature;

      const now = Date.now();
      if (stableCountRef.current < STABLE_SAMPLES_REQUIRED || now - lastOcrAtRef.current < OCR_COOLDOWN_MS) return;
      void runRecognition(false);
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
    if (!debugEnabled) setDebugCandidates([]);
  }, [debugEnabled]);

  return { status, debugCandidates, lastResult, captureSample: () => runRecognition(true) };
}
