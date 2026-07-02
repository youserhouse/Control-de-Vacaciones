# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A static PWA (no build step, no bundler, no package.json) for managing employee vacation days for a single team ("Mecafilter"). It's plain HTML/CSS/JS served directly from GitHub Pages at `youserhouse.github.io/Vacaciones/`, backed by Firebase (Auth + Firestore) for shared/synced state.

## Commands

There is no build, lint, or test tooling in this repo — it's hand-written HTML/CSS/JS loaded directly by the browser. To work on it:

- **Run locally**: serve the directory with any static file server (e.g. `npx serve .` or `python3 -m http.server`) and open `splash.html` or `login.html`. Opening `index.html` directly via `file://` will not work correctly because Firebase Auth/Firestore and the Service Worker require an http(s) origin.
- **Verify changes**: there's no automated test suite. Validate by loading the app in a browser and exercising the relevant view (dashboard / annual / monthly / gantt).
- **Force-refresh clients after deploy**: bump `CACHE_NAME` in `sw.js` whenever any cached asset (`ASSETS` array) changes — the Service Worker is Network-First but won't evict its old cache otherwise, which can leave production clients on stale HTML/CSS/JS combinations (this has caused real layout bugs before).

## Architecture

### Page flow
`splash.html` → `login.html` → `index.html`. `manifest.json`'s `start_url` is `login.html`. `splash.html` is just a branded loading screen that checks `firebase.auth().onAuthStateChanged` and redirects to `login.html` (no session) before timing out to `index.html`. `login.html` does email/password auth via Firebase Auth, then checks the signed-in user's email against a server-side whitelist (`config/access` Firestore doc) before allowing entry to `index.html`. `firebase.js` (loaded by `index.html`) also enforces this via `auth.onAuthStateChanged` → redirects to `login.html` if signed out.

### Firebase config centralization
`firebase-config.js` holds the single `firebaseConfig` object and is loaded as a global by `index.html`, `login.html`, and `splash.html` *before* any script that calls `firebase.initializeApp()`. Do not reintroduce inline copies of this config — keep it in one place. The Service Worker (`sw.js`) deliberately treats `firebase-config.js` as network-only (never cached) to avoid persisting the API key in a shared computer's cache.

### Web fonts (Syne / DM Sans)
Load Google Fonts via a direct `<link rel="preconnect">` + `<link rel="stylesheet">` pair in each HTML entrypoint's `<head>` (as `login.html`/`splash.html` already do) — do **not** rely solely on the `@import` at the top of `styles.css`. An `@import` inside an external stylesheet can only be discovered by the browser after it has fully downloaded and parsed `styles.css`, which delays the font fetch by a full extra round trip. On a slow/flaky mobile connection this increases the chance the page falls back to a system font while still applying `font-weight: 800` (used for the `Syne` display digits/headings) — most system fonts synthesize that weight as a heavily distorted, stretched-looking faux-bold. `index.html` was missing these direct `<link>` tags until this was diagnosed from a production screenshot on a mobile device; if you add a new HTML entrypoint, carry the same `<link>` pair over, and keep the `font-family` fallback stack (`-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif`) rather than a bare `sans-serif` so any fallback still renders at reasonable proportions.

### State model (`state.js`)
A single global `state` object is the source of truth for the whole app, persisted to `localStorage` (`vac-app-v3`) and mirrored to Firestore. Shape:
- `employees`: array of `{id, name, role, color, totalDays, birthday}`.
- `marks`: `{ "YYYY-MM-DD": { [employeeId]: "V" | "O" } }` — V = vacation, O = other/leave.
- `festivos`: `{ "YYYY-MM-DD": true }` — company holidays, don't count against an employee's day totals.
- `customRoles` / `compatibleRoles`: user-defined job roles and pairs of roles allowed to overlap without triggering a conflict warning.
- `conflictThreshold` / `conflictThresholdTotal`: thresholds used by `getConflictDays()` (in `calendar.js`) to flag days where too many people of the same/incompatible role, or too many people overall, are off simultaneously.
- `currentYear`, `theme` (`dark` | `light` | `mecafilter`), `selectedColor`, `activeFilters`.

Every mutation goes through `saveState()`, which writes to `localStorage` and then calls `window.saveToFirebase()` (defined in `firebase.js`) to push the whole state document up to Firestore. There's no granular/per-field sync — every save replaces the entire `vacaciones/estado` document.

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
- **Firestore rules** (not in this repo — managed in Firebase Console) gate `vacaciones/estado` and `config/secrets` behind an `isAuthorized()` check (email present in `config/access.emails`), while `config/access` itself is readable by any authenticated user (required so `login.html` can perform the whitelist check) but never writable from the client.
- **Auth error messages** are intentionally generic (`login.html`'s `MSGS` map) to avoid leaking whether an email is registered.
- The real gatekeeping for the Firebase Web API key happens outside this repo: HTTP-referrer restriction in Google Cloud Console. The key visible in `firebase-config.js` is expected to be public (standard for Firebase web apps) and is not a secret by itself.

### Service Worker (`sw.js`)
Network-First strategy: always tries the network, caches successful (200) responses, falls back to cache when offline, and falls back further to `index.html` for unmatched offline navigations. `firebase-config.js` is explicitly excluded from caching (see above). When adding a new top-level JS/CSS/HTML asset, add it to the `ASSETS` precache array **and** bump `CACHE_NAME`, or returning users may run a mismatched mix of new and stale files (this has caused a real production layout bug — stale `styles.css` served alongside a new `index.html` with new markup it didn't have rules for).

## Working across PRs / branches

This repo has previously hit GitHub PR conflicts in `index.html` when `main` advanced (other PRs merged) while a feature branch carried its own copies of already-merged commits. The fix pattern: `git fetch origin main && git rebase origin/main` (git will skip duplicate commits), then `git push --force-with-lease`.
