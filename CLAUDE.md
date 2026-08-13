# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A static PWA (no build step, no bundler, no package.json) for managing employee vacation days for a single team ("Mecafilter"). It's plain HTML/CSS/JS served directly from GitHub Pages at `youserhouse.github.io/Vacaciones/`, backed by Firebase (Auth + Firestore) for shared/synced state.

## Commands

There is no build or lint tooling in this repo — it's hand-written HTML/CSS/JS loaded directly by the browser. To work on it:

- **Run locally**: serve the directory with any static file server (e.g. `npx serve .` or `python3 -m http.server`) and open `splash.html` or `login.html`. Opening `index.html` directly via `file://` will not work correctly because Firebase Auth/Firestore and the Service Worker require an http(s) origin.
- **Run the tests**: `node --test "tests/*.test.mjs"` — no dependencies, no package.json, just Node's built-in runner. Quote the glob; `node --test tests/` tries to resolve the directory as a module and fails.
- **Verify changes**: the suite in `tests/` covers pure logic only (vacation quota, targeted saves, day signatures). Anything involving the DOM, Firestore round-trips or auth still has to be validated by loading the app in a browser and exercising the relevant view (dashboard / annual / monthly / gantt).

### Test harness (`tests/harness.mjs`)
The app's files are loose browser scripts that assume `window`/`document`/`localStorage` and talk to each other through globals, so they can't be `import`ed. `loadApp(files, extraGlobals)` runs them inside a `node:vm` context with those globals stubbed and returns `{ ctx, evaluate }`; `evaluate('someFn')` reaches top-level `let`/`const` bindings that never land on the global object. Tests therefore exercise **the real repo files**, not copies — copying the functions into the test would keep passing after someone broke the app.

Two gotchas: arrays and objects created inside the vm have that context's prototypes, so `assert.deepEqual` (strict) fails against host literals — compare lengths/fields instead; and `firebase.js` runs `initializeApp` at load, so loading it needs a `firebase` stub plus `diagMsg`/`showSync`/`hideSync` (see `firebaseFalso()` in `tests/guardado-dirigido.test.mjs`, which also captures the exact `update()` arguments).
- **Force-refresh clients after deploy**: bump `CACHE_NAME` in `sw.js` whenever any cached asset (`ASSETS` array) changes — the Service Worker is Network-First but won't evict its old cache otherwise, which can leave production clients on stale HTML/CSS/JS combinations (this has caused real layout bugs before).

## Architecture

### Page flow
`splash.html` → `login.html` → `index.html`. `manifest.json`'s `start_url` is `login.html`. `splash.html` is just a branded loading screen that checks `firebase.auth().onAuthStateChanged` and redirects to `login.html` (no session) before timing out to `index.html`. `login.html` does email/password auth via Firebase Auth, then checks the signed-in user's email against a server-side whitelist (`config/access` Firestore doc) before allowing entry to `index.html`. `firebase.js` (loaded by `index.html`) also enforces this via `auth.onAuthStateChanged` → redirects to `login.html` if signed out.

### Firebase config centralization
`firebase-config.js` holds the single `firebaseConfig` object and is loaded as a global by `index.html`, `login.html`, and `splash.html` *before* any script that calls `firebase.initializeApp()`. Do not reintroduce inline copies of this config — keep it in one place. The Service Worker (`sw.js`) deliberately treats `firebase-config.js` as network-only (never cached) to avoid persisting the API key in a shared computer's cache.

### Web fonts (Syne / DM Sans) — self-hosted in `/fonts`
Syne and DM Sans are **not** loaded from Google Fonts — the two variable-font files live in `/fonts` (`dm-sans.woff2` covers weights 300–600, `syne.woff2` covers 400–800) and are declared via `@font-face` directly in `styles.css` (for `index.html`) and inline in `login.html`'s `<style>` block (it doesn't load `styles.css`); `splash.html` gets them for free since it links `styles.css`. Each entrypoint also has `<link rel="preload" href="fonts/*.woff2" as="font" type="font/woff2" crossorigin>` tags in `<head>` to avoid a flash of fallback font on first paint.

This was originally loaded from Google Fonts (first via `@import` in `styles.css`, later "fixed" with a direct `<link rel="preconnect">`/`<link rel="stylesheet">` pair per entrypoint) but neither approach was reliable: on a production device where `fonts.googleapis.com`/`fonts.gstatic.com` weren't reachable, the page silently fell back to a system font while still applying `font-weight: 800` (used for the `Syne` display digits/headings) — most system fonts synthesize that weight as a heavily distorted, stretched-looking faux-bold. Self-hosting removes the third-party network dependency entirely (the files are same-origin and precached by `sw.js`), which is the only fix that's reliable regardless of the client's network. If you ever need to update these fonts (new weight, new family), re-fetch the `.woff2` from `https://fonts.googleapis.com/css2?family=...` with a modern desktop `User-Agent` (to get `woff2` instead of legacy formats) and use the **`latin`-subset** file only — Spanish needs no other Unicode range. Keep the `font-family` fallback stack (`-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif`) rather than a bare `sans-serif` so any fallback still renders at reasonable proportions, and add any new font file to `sw.js`'s `ASSETS` precache array + bump `CACHE_NAME`.

### State model (`state.js`)
A single global `state` object is the source of truth for the whole app, persisted to `localStorage` (`vac-app-v3`) and mirrored to Firestore. Shape:
- `employees`: array of `{id, name, role, color, totalDays, birthday}`.
- `marks`: `{ "YYYY-MM-DD": { [employeeId]: "V" | "O" } }` — V = vacation, O = other/leave.
- `festivos`: `{ "YYYY-MM-DD": true }` — company holidays, don't count against an employee's day totals.
- `customRoles` / `compatibleRoles`: user-defined job roles and pairs of roles allowed to overlap without triggering a conflict warning.
- `conflictThreshold` / `conflictThresholdTotal`: thresholds used by `getConflictDays()` (in `calendar.js`) to flag days where too many people of the same/incompatible role, or too many people overall, are off simultaneously.
- `currentYear`, `theme` (`dark` | `light` | `mecafilter`), `selectedColor`, `activeFilters`.

Every mutation goes through `saveState()`, which writes to `localStorage` and then pushes to Firestore. By default that means `window.saveToFirebase()` (in `firebase.js`), which replaces the **entire** `vacaciones/estado` document — so a save made from a stale local copy silently overwrites anyone else's concurrent change, anywhere in the state.

`saveState(paths)` takes an optional list of changed field paths (e.g. `[['marks','2026-05-10'], ['festivos','2026-05-10']]`) and routes to `window.savePathsToFirebase()` instead, which issues a Firestore `update()` touching only those fields. A path whose value no longer exists locally is sent as `FieldValue.delete()` rather than written as null, and the whole thing falls back to the full `set()` if `update()` fails (it does when the document doesn't exist yet, e.g. an empty database). Prefer the targeted form wherever the caller knows what changed; calling `saveState()` with no arguments keeps the old whole-document behaviour and is still correct, just coarser.

Currently only `saveDayMarks()` (`calendar.js`) uses the targeted form. The bulk paths — employee deletion (`employees.js`) and the import/clear routines (`export-import.js`) — still rewrite everything, which is acceptable because they're rare and admin-only.

Targeted writes narrow the blast radius but don't make concurrent edits to the *same* field safe. The day modal is built once when it opens while `onSnapshot` keeps mutating `state` underneath, so `saveDayMarks()` guards separately: `daySignature(key)` (marks + festivo, key-sorted because Firestore doesn't preserve insertion order) is captured in `openDayModal()` and re-checked before saving. If it changed, the modal reloads with fresh data and the save is aborted rather than overwriting. Any new UI that edits a day over a long-lived modal needs the same guard.

### Sync model (`firebase.js`)
- One Firestore document: `db.collection('vacaciones').doc('estado')` holds the entire serialized state (with `selectedColor`/`activeFilters` stripped as they're UI-only, and `compatibleRoles` JSON-stringified for storage).
- `startSync()` does an initial `DOC_REF.get()` then attaches `DOC_REF.onSnapshot()` for realtime updates from other devices/tabs.
- `mergeRemoteState()` merges incoming Firestore data into the local `state` object field-by-field and sets `isSyncing = true` briefly to prevent the local save triggered by the merge from re-triggering another remote write (a basic echo-prevention guard, not a real conflict-resolution strategy — last write wins).
- `loadSecret(fieldName)` reads from a separate `config/secrets` Firestore doc, gated by the same access-whitelist rules, for any future API keys the app might need client-side.

### Views and rendering (`state.js`, `calendar.js`, `gantt.js`, `employees.js`)
There are 4 views, each a `<div class="view" id="view-{name}">` toggled by `showView(name)` in `state.js`: `dashboard`, `annual`, `monthly`, `gantt`. `showView()` re-renders the target view from scratch on every navigation (`renderDashboard()`, `renderAnnual()`, `renderMonthly()`, `renderGantt()`) — there's no virtual DOM or diffing, just full `innerHTML` rebuilds driven by reading `state` directly. Views are rendered into the legacy tab strip (`.tab-btn`) **and** the redesigned sidebar (`.nav-item`) simultaneously — both UIs must stay in sync when adding a new view (see `showView()`'s explicit index mapping `['dashboard','annual','monthly']` for the legacy tabs vs. the `nav-{view}` ids for the sidebar).
- `calendar.js`: dashboard stats, annual grid, monthly grid, the day-detail modal (`openDayModal`/`saveDayMarks`), and conflict detection (`getConflictDays`/`rolesAreCompatible`).
- `gantt.js`: month-at-a-time wallchart view, one row per employee, independent month/year navigation state (`_gMonth`/`_gYear`) from the annual/monthly views' own selectors.
- `employees.js`: employee CRUD modal, color picker, custom role management, and the conflict-threshold/compatible-roles settings modal.

### Import/Export (`export-import.js`)
Three independent features sharing one file:
1. **PDF export** (`generatePDF`) via `jsPDF`.
2. **ICS export** (`generateICS`) and **text-based import** (`handleImportFile`/`extractDatesFromText`) that parses PDF/text exports from elsewhere via `pdf.js`, fuzzy-matches employee names (`findBestMatch`), and lets the user confirm before writing into `state.marks`.
3. **Excel festivos import** (`openFestivosExcelModal`/`handleFestivosFile`/`confirmFestivosImport`) via `SheetJS` (`xlsx.full.min.js`) — parses Excel serial dates and DD/MM/YYYY or YYYY-MM-DD strings in **local time** (deliberately avoids `new Date(string)` UTC-offset bugs) and writes into `state.festivos`.

All three external libs (`jspdf`, `pdf.js`, `xlsx.full.min.js`) are loaded from `cdnjs.cloudflare.com` in `index.html`'s `<head>` — if you add another CDN dependency, also add its origin to the CSP `script-src`/`worker-src` (see below) and to `sw.js`'s `isExternal` check so the Service Worker doesn't try to cache it.

### Security model
- **CSP**: each HTML entrypoint (`index.html`, `login.html`, `splash.html`) carries its own `<meta http-equiv="Content-Security-Policy">` tag (kept in sync manually across all three — there's no shared template). GitHub Pages can't serve custom HTTP headers, so this is the only enforcement mechanism available (the `_headers` file in the repo root is a Netlify-only format and has no effect here).
- **Firestore rules** live in `firestore.rules` at the repo root, and `firebase.json` exists solely to point the Firebase CLI at it (it is *not* a build config — GitHub Pages ignores both files). They gate `vacaciones/estado`, `rotacionSemanal/{weekKey}` and `bajas/{weekKey}` behind an `isAuthorized()` check (lowercased `request.auth.token.email` present in `config/access.emails`), while `config/access` itself is readable by any authenticated user (required so `login.html` can perform the whitelist check) but never writable from the client, and `config/secrets` is read-only (the client only ever reads it via `loadSecret()`).
  - **Every Firestore collection the client touches needs an explicit `match` block** — Firestore denies anything no rule allows. This is not theoretical: `rotacionSemanal` and `bajas` shipped in commit `9dcfb72` without rules, so the whole "Tareas Semanales" section silently failed to save for months (the collections never even came into existence). It stayed invisible because `firebase.js`'s helpers catch the error and fall back to empty data — a `permission-denied` never surfaces to the user. If a new section mysteriously won't persist, check `firestore.rules` **first**.
  - **Deploying rules**: `npx firebase-tools deploy --only firestore:rules --project control-vacaciones-50415`. Always pass `--project` explicitly — the CLI's default project on the current dev machine is a *different* Firebase project. Rules deploy independently of the GitHub Pages deploy, so `firestore.rules` can be committed here and still be out of sync with what's live; treat the deployed ruleset as the source of truth and re-deploy after editing this file.
  - The rules enforce **who** may write, not **what** they write. The annual vacation quota (`getVacQuota`/`canMarkVacation`/`validateVacProposals` in `state.js`) is enforced client-side only, so a device running stale cached JS can still push over-quota data, which then syncs everywhere via `onSnapshot`. Enforcing it server-side is not possible against the current schema — rules cannot loop over `marks` to count a given employee's `'V'` days, nor search the `employees` array for their `totalDays` — and would require splitting `marks` into one document per employee+year plus a `config/cupos` map. Do not assume the rules validate quota.
  - Note that `firebase firestore:rules get` does not exist — there is no CLI command to read the deployed rules back. Reading them requires the Firebase Rules REST API (`firebaserules.googleapis.com`), e.g. via `firebase-tools`' internal `lib/gcp/rules.js` (`listAllReleases` → `getLatestRulesetName` → `getRulesetContent`). `rules.testRuleset()` compiles rules without deploying and is worth running before any deploy.
- **Auth error messages** are intentionally generic (`login.html`'s `MSGS` map) to avoid leaking whether an email is registered.
- The real gatekeeping for the Firebase Web API key happens outside this repo: HTTP-referrer restriction in Google Cloud Console (currently locked to `https://youserhouse.github.io`, `https://youserhouse.github.io/*`, and `http://localhost/*` for local dev). The key visible in `firebase-config.js` is expected to be public (standard for Firebase web apps) and is not a secret by itself — it has to reach the browser to initialize Firebase client-side, so no amount of hiding it in the repo (env vars, build-time secrets, etc.) makes it invisible to an end user with DevTools open. Moving it out of source control would only reduce its visibility to GitHub's scanners, not to actual visitors, and this repo has no build step to inject it at build time anyway (see "What this is" above).
  - GitHub's Secret Scanning flagged this key as a "Google API Key / Public leak" (alert #1, opened May 6). This was reviewed and dismissed as a false positive: the key is doing its job as designed, and the actual security boundary (referrer restriction above + Firestore rules) was verified in place first. Do not "fix" this by trying to move the key into a secret/env var — that doesn't add real protection here (see previous bullet) and would require introducing a build pipeline this project deliberately doesn't have. If a similar alert reappears (e.g. after a `firebase-config.js` rotation), the fix is: confirm the referrer restriction still lists the right origins, then dismiss the alert again with the same reasoning — don't restructure the app around it.

### Service Worker (`sw.js`)
Network-First strategy: always tries the network, caches successful (200) responses, falls back to cache when offline, and falls back further to `index.html` for unmatched offline navigations. `firebase-config.js` is explicitly excluded from caching (see above). When adding a new top-level JS/CSS/HTML asset, add it to the `ASSETS` precache array **and** bump `CACHE_NAME`, or returning users may run a mismatched mix of new and stale files (this has caused a real production layout bug — stale `styles.css` served alongside a new `index.html` with new markup it didn't have rules for).

## Working across PRs / branches

This repo has previously hit GitHub PR conflicts in `index.html` when `main` advanced (other PRs merged) while a feature branch carried its own copies of already-merged commits. The fix pattern: `git fetch origin main && git rebase origin/main` (git will skip duplicate commits), then `git push --force-with-lease`.
