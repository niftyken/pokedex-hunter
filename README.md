# Pokedex Hunter

**Pokedex Hunter** is a camera-first React + Vite Progressive Web App for finding physical English Pokémon cards that match a locally stored **Want List**. It is intended for bulk-card searching on iPhone and Android, with all preferences and lists retained locally in browser storage.

Current release: **v0.8.1**.

## Current capabilities

- **Live camera scanning:** The rear camera is requested automatically on Scan. The stream is released whenever you switch to Want List or Settings, conserving battery and preventing background camera activity.
- **Continuous camera background:** The live camera remains the visual background behind the whole Scan screen. OCR Preview, controls, manual lookup, and navigation use dark translucent panels rather than a hard camera-stage cutoff.
- **Operator-defined OCR region:** Drag the OCR rectangle to reposition it and drag its corner handles to resize it. Geometry is stored per device, so the app works for handheld scanning and fixed-card rigs.
- **Scan-box guidance:** The helper **`Capture Pokémon name in the scan box`** appears immediately above the OCR box, over low-priority card metadata rather than the Pokémon name. The status pill sits below the box.
- **OCR Preview:** The on-screen OCR Preview shows the processed crop, raw OCR, canonical species candidate, confidence, and runner-up. It remains available from Scan and is enabled by default for testing.
- **Focused preprocessing:** Before OCR, the app trims a small inner margin around the visible box, enlarges the crop, applies grayscale/local contrast normalization, and suppresses nearly full-width dark rules that commonly arise from card frames.
- **Auto Scanning and Capture:** Auto Scanning is enabled by default. It uses a forgiving handheld stability check, a shorter OCR cooldown, and a forced attempt roughly every 1.35 seconds so low-light hand movement cannot make the scanner wait indefinitely. Turn Auto Scanning off to scan only when you press **Capture**. Capture is always available, even when OCR Preview is hidden, and requests OCR for the current frame unless an OCR job is already running.
- **Clear scan feedback:** The status area says **`Scanning for Pokémon names…`** when it is intentionally ignoring non-name text. A confident non-hit says **`[Pokémon] is not on the list. Move on.`** and briefly pulses the OCR box/status warm red, so bulk search can continue without hesitation. Medium-confidence reads ask **`Is that a [Pokémon]?`**. Diagnostic raw text remains in OCR Preview.
- **Pokémon species recognition:** OCR is constrained against a bundled English National Dex list. Card metadata such as **Basic** is excluded from recognition scoring, including common one-character OCR damage such as `asic` or `baslc`, so it does not compete with the Pokémon name. Common punctuation is normalized. A bare **Nidoran** is considered only when exactly one Nidoran form remains on the Want List, and it always requires confirmation.
- **Fixed matching policy:** The former Sensitivity setting was removed. The app uses one consistent handheld policy: a high-confidence canonical read can immediately trigger a Want List hit, while medium evidence needs repeat agreement and operator confirmation where appropriate. Matching is canonical and exact, so **Mew** never matches **Mewtwo**, **Latias** never matches **Latios**, and the two Nidoran forms never match each other.
- **Green / yellow workflow:** Strong Want List matches open a green hit sheet. A medium candidate stays yellow until the operator confirms it. The hit sheet presents the canonical species and its Pokédex number, followed by **Remove from Want List**, **Keep on Want List**, and **Reject**.
- **Manual name check and autocomplete:** Enter any Pokémon name manually. As you type, a short local type-ahead list prioritizes Want List entries, then canonical National Dex names. Selecting a suggestion immediately checks its exact canonical species; a Want List match follows the same green-alert workflow as OCR.
- **Want List workflow:** One search term per line; blanks and duplicates are ignored. The Want List tab also includes an **Add a Pokémon** autocomplete field for adding canonical names without spelling mistakes. First-time installations receive the bundled default 392-Pokémon list, and existing users can load it from Want List at any time.
- **Published default Want List:** Settings stores a configurable published CSV URL. **Restore default Want List** fetches that CSV only after confirmation, reads one Pokémon name from the first populated column of each row, validates exact National Dex identities, and replaces the local Want List. This lets the primary list be maintained in a published Google Sheet without creating a new build.
- **Settings:** The Settings tab contains camera selection, the default Want List CSV URL, Restore default Want List, and Reset scan setup. **Reset scan setup** restores the default OCR region and turns OCR Preview and Auto Scanning on; it does not replace the Want List.
- **Visible build marker:** The Scan header displays the release version, which should be checked before evaluating a new Vercel deployment.
- **PWA cache revisioning:** The service-worker cache is versioned per release to reduce stale app-shell problems after deployment.

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

1. Open **Scan**; camera starts automatically. The header displays **Want List: _n_** and the visible release version.
2. Move or resize the OCR box so the printed name sits inside it. The helper **Capture Pokémon name in the scan box** appears immediately above the box. Keep unrelated text, especially **Basic**, HP, and border lines, outside the box when practical.
3. Watch the status line: **Scanning for Pokémon names…** means no usable species has been recognized yet. A confident non-hit says **`[name] is not on the list. Move on.`** and flashes warm red. **Is that a [name]?** asks for confirmation of a medium-confidence candidate.
4. With **Auto On**, hold the card reasonably steady; the app prefers a briefly stable frame but also forces an attempt after a short wait in difficult handheld lighting. Press the centered **Capture** button at any time to scan the current frame immediately. With Auto Off, Capture is the normal scanning action.
5. Use **OCR Preview** to inspect the processed crop, raw OCR, and canonical candidate. The manual field offers local suggestions as you type; choose one to check it immediately, or press Check to test typed text directly.
6. A strong Want List match opens the green sheet. A yellow `?` candidate can be confirmed manually.
7. Use **Remove from Want List**, **Keep on Want List**, or **Reject** to resume scanning. Open **Settings** when changing camera, restoring the published list, or resetting the scan setup.

## Restore a published default Want List

The app is preconfigured with the primary user's published Google Sheet CSV URL. To use a different source, replace the URL in **Settings → Default Want List**. The source should be a publicly readable CSV with one Pokémon name per row in its first populated column. A header such as `Pokemon` or `Name` is accepted and ignored.

When **Restore default Want List** is pressed, the app asks for confirmation, fetches the CSV, validates entries against the built-in English National Dex, replaces the local Want List, and reports any skipped rows. The app reads the CSV but never writes to the Sheet.

## Data and privacy model

- No account, backend, analytics, cloud synchronization, marketplace lookup, pricing data, scan history, or card database is required.
- Want List entries, camera preference, OCR-preview preference, Auto Scanning preference, OCR-zone geometry, and the published default-list URL are stored in `localStorage` on the current device/browser.
- The published CSV is only requested when the user explicitly chooses Restore default Want List.
- Clearing browser/site data removes locally saved app data.

## Project structure

- `src/App.tsx` — screen routing and local persistence.
- `src/components/ScanScreen.tsx` — live camera UI, status messaging, non-hit feedback, OCR-zone controls, OCR Preview, scan-mode controls, manual checks, confirmation, and green hit sheet.
- `src/components/ScanToolsScreen.tsx` — Settings tab: camera selection, published default Want List source, list restore, and reset of the full scan setup.
- `src/components/WantedListScreen.tsx` — multiline Want List editor and bundled-list loader.
- `src/components/BottomNav.tsx` — Scan / Want List / Settings navigation.
- `src/hooks/useCamera.ts` — `getUserMedia` lifecycle and camera teardown.
- `src/hooks/useTitleOcr.ts` — crop mapping, preprocessing, forgiving auto-scan gating, manual Capture override, temporal agreement, and preview state.
- `src/lib/ocr.ts` — Tesseract.js worker integration.
- `src/lib/species.ts` — English species lookup, canonicalization, card-metadata filtering, type-ahead search, aliases, and Pokédex formatting.
- `src/lib/matching.ts` — Want List parsing and fixed conservative matching policy.
- `src/lib/defaultWantedList.ts` — bundled default list.
- `src/lib/defaultWantListSource.ts` — published CSV default, CSV parsing, and exact species validation.
- `src/lib/storage.ts` — `localStorage` keys, defaults, and persisted scan settings.
- `public/sw.js` — service-worker app-shell cache.
