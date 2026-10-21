# Feature: inventory-panel

## Objective
A local, unlisted `admin.html` page to manage the inventory (`singles.json`) without hand-editing JSON: view all cards, add a card, remove a card, and mark one as sold. It exports the updated `singles.json` for the owner to drop into the repo.

## Problem / Why
Today `singles.json` is the only way to manage inventory and it must be edited by hand. The owner sells cards regularly (3 sold on 2026-10-21 alone) and hand-editing JSON risks syntax errors and duplicates. No admin UI exists by design, but the manual flow is now frequent enough to justify one.

## Scope
- New `admin.html` (unlisted, opened from the local server only; not linked from `index.html` and not part of the public flow).
- Reads `singles.json` and `catalog.json` on load (both are static files served by the local server) to show name, set, number, price, qty and language per card.
- Operations: add a card (game, group, product, qty, optional variant/condition/language/price), remove a card, mark as sold (decrement qty; at qty 0 the entry is removed).
- Validation before export, reusing the same rules as `validateSingles` (game, positive integers, no duplicate game+product+variant, valid language, valid manual price).
- Export: download the resulting `singles.json` via a Blob + anchor download.
- Never writes to disk itself; never calls GitHub; no token; no backend.

## Constraints
- Plain HTML, no build step, Node 22 stdlib only, zero npm dependencies.
- Local only: it is not published and not discoverable from the catalog.
- Strict palette and light theme from `index.html` stay consistent.
- No automated write to the repo: the owner replaces `singles.json` manually and runs `npm run prices`.

## Tasks
- [x] T1 — `scripts/inventory.mjs`: pure helper module (upsert/remove/sell + validate reuse) with tests (route: delegated writer; trigger: 2+ non-trivial files)
- [x] T2 — `admin.html`: UI wired to the helper, export via download (route: same delegated writer)
- [x] T3 — README section documenting the panel (route: inline)

## Acceptance criteria
- `npm test` passes, including new inventory helper tests.
- Opening `admin.html` from the local server lists the current inventory with names and prices.
- Adding, removing and marking sold update the in-memory list with immediate visual feedback.
- Export downloads a `singles.json` that `validateSingles` accepts and that `node scripts/update-prices.mjs` consumes without errors.
- A duplicate card or an invalid field blocks export with a visible message.

## Delivery strategy
ask-on-risk. Forecast ~450 authored lines (over the ~400 heuristic: helper + tests + UI + README).

## Progress / Evidence

### T1 + T2 — helper module and admin panel (2026-10-21)

Strict TDD: `scripts/inventory.test.mjs` was written first and observed RED
(`Cannot find module .../scripts/inventory.mjs`), then `scripts/inventory.mjs` was implemented to GREEN.

Files:
- `scripts/inventory.mjs` — 44 lines. Pure, immutable helpers; `addCard` delegates every rule to
  `validateSingles` from `catalog.mjs` (no duplicated validation). Exports `addCard`, `removeCard`,
  `sellCard`, `serializeInventory`.
- `scripts/inventory.test.mjs` — 74 lines, 10 tests (node:test + node:assert/strict).
- `admin.html` — 297 lines, plain HTML + one `<script type="module">`, zero dependencies. Reuses the
  palette and the `GAMES`/`LANGUAGES`/`CONDITIONS` labels from `index.html`, joins inventory to
  `catalog.json` by `id` (`${game}-${product}`), and exports via Blob + object URL + `download="singles.json"`.

Commands (foreground):
- `npm test` → 31 tests, 31 pass, 0 fail (21 pre-existing + 10 new).
- `node --check scripts/inventory.mjs` → valid ESM.
- Scratch DOM smoke test (run from `/tmp`, not committed, no jsdom): loaded `admin.html`, joined a row to
  a catalog item, rejected a duplicate with the validation message, added a card, sold the last unit
  (entry removed), removed with `confirm`, and exported an empty round-tripping `singles.json` → PASS.

Notes for the parent:
- The page imports `./scripts/inventory.mjs` with a relative path; it must be served over HTTP
  (`python3 -m http.server 8000`). That is intentional: inline code cannot import a module, and serving the
  repo root is the documented local flow. `file://` shows a clear error message instead of failing silently.
- T3 (README) is left for the inline route and still open.

### T3 — README section (2026-10-21, inline)

Added a "Panel de inventario (local)" section to `README.md`: what the panel does, the 4-step flow
(edit → Exportar → replace `singles.json` → `npm run prices`), the sell/remove semantics, the shared
validation rules, the no-token/no-write guarantee, and the HTTP-not-file:// requirement.

### Parent verification (independent of the writer)

- `npm test` → 31 tests, 31 pass, 0 fail.
- `node --check scripts/inventory.mjs` → valid ESM.
- Direct module probes: `sellCard` qty 3 → 2 (entry kept); qty 1 → entry removed; variant mismatch
  returns `ok: false`; input array byte-identical after every call (immutability confirmed).
- `serializeInventory` output round-trips and passes `validateSingles` with zero errors.
- `git status` shows only the 4 new files plus `README.md`; no protected file touched.

### Native review (2026-10-21, lineage review-27ab345166818149)

Risk medium, 1 lens (`review-reliability`), consent granted. The reviewer returned 7 findings; the
provider admitted two CRITICALs as candidate-caused and opened one bounded correction (budget 200
lines; 59 used).

Findings and disposition:
- R3-001 (CRITICAL) — export never validated the inventory. FIXED: `admin.html` now imports
  `validateSingles` and validates the full in-memory inventory before building the Blob; it also
  surfaces load-time errors so a bad file is visible before export.
- R3-002 (CRITICAL) — a failed load left Export armed and downloaded `[]`. FIXED: a `loaded` flag
  guards `exportInventory()`; the catch branch disables the export button and the whole add form and
  renders an explicit error row. Verified with a stubbed DOM: `export.disabled === true` after a
  failed fetch.
- variant `null` unmatched (WARNING) — FIXED: `matches` now normalizes both sides with `?? null`.
- malformed `qty` silently became `null` (WARNING) — FIXED: `sellCard` rejects a non-positive-integer
  `qty`; `qty === 1` (not `<= 1`) is the removal case.
- duplicate removeCard, unproven export tests (SUGGESTION/INFO) — tests added for the export
  validation guarantee, the `variant: null` branch, and the malformed-qty rejection.

Evidence: `npm test` → 35 tests, 35 pass, 0 fail (21 pre-existing + 14 inventory). Syntax checked
with `node --check` for the module and for the extracted inline script of `admin.html`.

Commit `217690a`... see the correction commit below.

## Next step
Commit the correction (a frozen candidate is required by the review), then finish the review.
