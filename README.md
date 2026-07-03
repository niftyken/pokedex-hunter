# Pokedex Hunter

**Pokedex Hunter** is a camera-first React + Vite Progressive Web App for finding physical English Pokémon cards that match a locally stored Wanted List. It is intended for bulk-card searching on iPhone and Android, with all lists and settings retained locally in browser storage.

## Current capabilities

- **Live camera scanning:** The rear camera is requested automatically on Scan. The stream is released whenever you switch to Wanted List, conserving battery and preventing background camera activity.
- **Operator-defined OCR region:** Drag the OCR rectangle to reposition it and drag its corner handles to resize it. Geometry is stored per device, so the app works for handheld scanning and fixed-card rigs.
- **Shallow default name strip:** The default scan box is intentionally short to avoid HP values, evolution labels, borders, attack text, and decorative elements. You may still widen or resize it for unusual layouts.
- **OCR Preview:** The on-screen OCR Preview shows the processed crop, raw OCR, canonical species candidate, confidence, and runner-up. It remains available from Scan and is enabled by default for testing.
- **Focused preprocessing:** Before OCR, the app trims a small inner margin around the visible box, enlarges the crop, applies grayscale/local contrast normalization, and suppresses nearly full-width dark rules that commonly arise from card frames.
- **Auto Scanning and Capture:** Auto Scanning is enabled by default. It uses a forgiving handheld stability check, a shorter OCR cooldown, and a forced attempt roughly every 1.35 seconds so low-light hand movement cannot make the scanner wait indefinitely. Turn Auto Scanning off to scan only when you press **Capture**. Capture is always available, even when OCR Preview is hidden, and immediately requests OCR for the current frame (unless an OCR job is already running).
- **Clean status behavior:** Nonsense or ambiguous OCR is represented on the primary screen as **`Read: Scanning…`**, not as a misleading raw string. Diagnostic raw text remains in OCR Preview.
- **Pokémon species recognition:** OCR is constrained against a bundled English National Dex list. Card metadata such as **Basic** is excluded from recognition scoring, including common one-character OCR damage such as `asic` or `baslc`, so it does not compete with the Pokémon name. Common punctuation is normalized. A bare **Nidoran** is considered only when exactly one Nidoran form remains on the Wanted List, and it always requires confirmation.
- **Fixed matching policy:** The former Sensitivity setting was removed. Rather than exposing several opaque thresholds, the app uses a consistent handheld policy: a high-confidence canonical read can immediately trigger a Wanted List hit, while medium evidence needs repeat agreement and operator confirmation where appropriate. Wanted List matching is canonical and exact, so **Mew** never matches **Mewtwo**, **Latias** never matches **Latios**, and the two Nidoran forms never match each other.
- **Green / yellow workflow:** Strong Wanted List matches open a green hit sheet. A medium candidate stays yellow until the operator confirms it. The hit sheet presents the canonical species and its Pokédex number, followed by **Remove from List**, **Keep on List**, and **Reject**.
- **Manual name check:** Enter any Pokémon name manually. A Wanted List match follows the same green-alert workflow as OCR.
- **Wanted List workflow:** One search term per line; blanks and duplicates are ignored. First-time installations receive the bundled default 392-Pokémon list, and existing users can load it from Wanted List at any time.
- **In-app controls:** OCR Preview, **Auto Scanning**, **Capture**, OCR-region reset, and camera selection are available directly on Scan. The Scan mode readout explains whether Auto is waiting for a stable picture, reading a card, or Tap Capture mode is active. Reset restores the default OCR region and turns Auto Scanning back on. There is no separate Settings screen.
- **Visible build marker:** The Scan header displays the release version, which should be checked before evaluating a new Vercel deployment.
- **PWA cache revisioning:** The service worker cache is versioned per release to reduce stale app-shell problems after deployment.

## Run locally

```bash
npm install --registry=https://registry.npmjs.org && npm run build && npm run dev
```

`npm run dev` remains active because it is serving the local app. Stop it with `Ctrl+C` when finished. Camera access requires HTTPS in production or localhost during development.

## Deploy

After local testing:

```bash
git add . && git commit -m "Describe change" && git push origin main
```

Vercel deploys from `main`. Open the newest Ready deployment, then confirm the version visible in the Scan header before testing features. A previously installed PWA can retain an older shell temporarily; a private/incognito browser session is a quick clean-cache verification path.

## Main scanning flow

1. Open **Scan**; camera starts automatically.
2. Move or resize **SCAN POKÉMON NAME HERE** so the printed name sits inside it. Keep unrelated text, especially **Basic**, HP, and border lines, outside the box when practical.
3. With **Auto Scanning On**, hold the card reasonably steady; the app prefers a briefly stable frame but also forces an attempt after a short wait in difficult handheld lighting. With Auto Scanning Off, press **Capture** when the name is framed. Capture works regardless of OCR Preview visibility.
4. Use **OCR Preview** to inspect the processed crop if recognition is not behaving as expected.
5. A strong Wanted List match opens the green sheet. A yellow `?` candidate can be confirmed manually.
6. Use **Remove from List**, **Keep on List**, or **Reject** to resume scanning. Use the manual field to check any name directly.

## Data and privacy model

- No account, backend, analytics, cloud synchronization, marketplace lookup, pricing data, scan history, or card database is required.
- Wanted List entries, camera preference, OCR-preview preference, Auto Scanning preference, and OCR-zone geometry are stored in `localStorage` on the current device/browser.
- Clearing browser/site data removes locally saved app data.

## Project structure

- `src/App.tsx` — screen routing and local persistence.
- `src/components/ScanScreen.tsx` — live camera UI, OCR-zone controls, manual checks, confirmation, and green hit sheet.
- `src/components/WantedListScreen.tsx` — multiline list editor and default-list loader.
- `src/components/BottomNav.tsx` — Scan / Wanted List navigation.
- `src/hooks/useCamera.ts` — `getUserMedia` lifecycle and camera teardown.
- `src/hooks/useTitleOcr.ts` — crop mapping, preprocessing, forgiving auto-scan gating, manual Capture override, temporal agreement, and preview state.
- `src/lib/ocr.ts` — Tesseract.js worker integration.
- `src/lib/species.ts` — English species lookup, canonicalization, card-metadata filtering, aliases, and Pokédex formatting.
- `src/lib/matching.ts` — Wanted List parsing and fixed conservative matching policy.
- `src/lib/defaultWantedList.ts` — bundled default list.
- `src/lib/storage.ts` — `localStorage` keys, defaults, and persisted OCR-zone settings.
- `public/sw.js` — service-worker app-shell cache.
