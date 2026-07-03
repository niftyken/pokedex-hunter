# Pokedex Hunter

**Pokedex Hunter** is a camera-first React + Vite Progressive Web App for finding physical English Pokémon cards that match a locally stored Wanted List. It is designed for bulk-card searching on an iPhone or Android device, with all lists and settings kept on-device in browser storage.

## Current capabilities

- **Live camera scanning:** Opens the rear camera by default on the Scan screen. The camera stream is released when you switch to Wanted List, reducing battery use and avoiding unnecessary camera activity.
- **Operator-defined OCR region:** Drag the OCR rectangle to reposition it and drag its corner handles to resize it. The region is stored locally per device, making it practical for both handheld scanning and a fixed rig.
- **OCR preview and quality control:** The on-screen **OCR Preview** displays the current crop and OCR feedback. The preview can be toggled from the main Scan controls and is enabled by default for active testing.
- **Pokémon species recognition:** OCR output is constrained against an internal English National Dex species list, including support for common punctuation and form-name edge cases. Recognized results are displayed with their Pokédex number where available.
- **Conservative hit handling:** A strong match against the Wanted List opens a green match sheet. Medium-confidence reads remain yellow until the operator confirms them.
- **Manual name check:** Enter a Pokémon name manually when desired—not only when OCR misses. A Wanted List match follows the same green-alert workflow as an OCR match.
- **Wanted List workflow:** One search term per line; blanks and duplicates are ignored. First-time installs are seeded with the bundled 392-Pokémon default list, and existing users can load that list from Wanted List at any time.
- **Hit controls:** A green match sheet shows the Pokémon name and Pokédex number, then offers **Remove from List**, **Keep on List**, and **Reject**. The two primary actions are tall, separated controls to reduce accidental taps; Reject is a separate full-width action below.
- **In-app controls:** OCR Preview, sensitivity level, camera choice, and OCR-region reset are all available directly on the Scan screen. There is no separate Settings screen.
- **Visible build marker:** The Scan header displays the release version, making it easier to confirm which Vercel deployment is actually running.
- **PWA caching:** A lightweight service worker supports app-shell caching and is versioned with each release to reduce stale deployment issues.

## Run locally

```bash
npm install
npm run dev
```

Open the local Vite URL in a browser. Camera access requires `https://` in production or `localhost` in development.

## Build

```bash
npm run build
```

The app is intended to deploy from the `main` branch to Vercel. After testing locally, commit and push before evaluating the hosted build:

```bash
git add .
git commit -m "Describe change"
git push origin main
```

Confirm the visible version in the Scan header before testing a new hosted feature.

## Main user flow

1. Open **Scan**; the camera starts automatically.
2. Move or resize **SCAN POKÉMON NAME HERE** until the printed card name sits within the rectangle.
3. Use **OCR Preview** to verify that the crop contains the intended name.
4. A strong Wanted List match opens the green sheet. A yellow `?` result can be confirmed manually.
5. Use **Remove from List**, **Keep on List**, or **Reject** to resume scanning.
6. Use the manual field to check any Pokémon name directly.

## Data and privacy model

- No account, backend, analytics, cloud synchronization, marketplace lookup, pricing data, scan history, or card catalog is required.
- Wanted List entries, scanning controls, camera preference, sensitivity, and OCR-zone geometry are stored in `localStorage` on the current device/browser.
- Clearing browser/site data removes locally saved app data.

## Project structure

- `src/App.tsx` — screen routing and local persistence.
- `src/components/ScanScreen.tsx` — live camera UI, resizable OCR zone, OCR preview, manual checks, match confirmation, and green hit sheet.
- `src/components/WantedListScreen.tsx` — multiline list editor and default-list loader.
- `src/components/BottomNav.tsx` — Scan / Wanted List navigation.
- `src/hooks/useCamera.ts` — `getUserMedia` lifecycle and camera teardown.
- `src/hooks/useTitleOcr.ts` — OCR crop capture, preprocessing, recognition cadence, and preview state.
- `src/lib/ocr.ts` — Tesseract.js worker integration.
- `src/lib/species.ts` — English species lookup, canonicalization, aliases, and Pokédex formatting.
- `src/lib/matching.ts` — Wanted List parsing, normalization, and deterministic matching.
- `src/lib/defaultWantedList.ts` — bundled default list.
- `src/lib/storage.ts` — `localStorage` keys, defaults, and persisted OCR-zone settings.
- `public/sw.js` — service-worker app-shell cache.

## Notes for future development

The app intentionally treats the operator-defined OCR box as the source of truth. It does not attempt to classify card layouts, detect card edges, or force a particular Pokémon TCG template. This keeps the scan flow usable for different eras, unusual card formats, and fixed-camera setups.
