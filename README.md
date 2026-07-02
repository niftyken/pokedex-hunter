# Pokedex Hunter — Phase 1

Browser-based, camera-first React + Vite app for searching physical English Pokémon card bulk against a locally saved Wanted List.

## Run

```bash
npm install
npm run dev
```

Camera access requires `https://` in production (or `localhost` during development).

## File structure

- `src/App.tsx` — app shell, navigation, persistent state.
- `src/components/ScanScreen.tsx` — camera UI, scan guide, demo/OCR result response, confirmation controls.
- `src/components/WantedListScreen.tsx` — fast multiline list editor.
- `src/components/SettingsScreen.tsx` — sensitivity, camera, and display/demo settings.
- `src/hooks/useCamera.ts` — self-contained `getUserMedia` lifecycle.
- `src/lib/matching.ts` — list parsing, title normalization, deterministic matching.
- `src/lib/storage.ts` — localStorage persistence.
- `src/lib/ocr.ts` — future OCR adapter contract.

## Phase 1 behavior

The app requests the rear camera when supported, shows a responsive card-shaped scan zone, and persists all settings/list data locally. Developer demo OCR is enabled by default: select a simulated card title and tap **Test** to exercise yellow/green matching and the Remove / Keep / Reject flow.

No live OCR or edge detection is included yet. The UI logic is already isolated from those future stages, so a Tesseract.js implementation can call the `OcrAdapter.readTitle` contract after a stability/crop layer is added.
