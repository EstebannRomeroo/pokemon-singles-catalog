# Feature: pokemon-singles-catalog

## Objective
Free, static catalog of Pokémon TCG singles with prices in COP.

## Problem / Why
Owner needs a shareable price list that is easy to update. Collectr has no public API, so prices come from pokemontcg.io (TCGPlayer market USD, free).

## Scope
- Inventory in `singles.json` (card id, qty, optional variant/condition/manual price).
- `scripts/update-prices.mjs` builds `catalog.json` from pokemontcg.io prices + fixed, owner-edited `usdToCop` in config.json.
- Price rule: `max(minPrice, ceil(usd * rate * margin / roundTo) * roundTo)`; manual price overrides. minPrice = 2000 COP.
- `index.html` (no build step) renders catalog with search and sort.
- GitHub Actions weekly job refreshes prices; GitHub Pages hosts it.

## Constraints
All free. No backend, no DB, no auth. Node 22 stdlib only, zero npm dependencies.

## Tasks
- [x] T1 — Price logic + update script + test (route: delegated writer; trigger: 2+ non-trivial files)
- [x] T2 — Static page `index.html` (same writer)
- [x] T3 — GitHub Actions workflow + README (same writer)
- [x] T3b — Fixed editable USD→COP rate (inline)
- [x] T4 — Harden update script: fail on missing cards, reject invalid manual price, variant price fallback, validate config, no-op commit when unchanged (route: delegated writer; trigger: 2+ non-trivial files)
- [x] T5 — Keep owned variant, add priceVariant + Spanish variant labels (inline)

## Acceptance criteria
- `node --test` passes.
- `node scripts/update-prices.mjs` produces `catalog.json` from sample inventory.
- Page renders catalog via `python3 -m http.server`.

## Delivery strategy
ask-on-risk. Forecast ~350 authored lines.

## Progress / Evidence
T1–T3 written by delegated writer (uncommitted; parent commits). Observed 2026-10-16:
- `node --test "scripts/*.test.mjs"`: 4 tests, 4 pass, 0 fail.
- `node scripts/update-prices.mjs`: `catalog.json: 6 items, 1 USD = 3184.574607 COP`; summary `6 3184.574607 sv1-25:2000 sv1-1:2000 sv3pt5-25:2000 swsh12pt5-160:126500 sv4pt5-232:2751000 base1-4:3500000` (base1-4 manual price).
- `python3 -m http.server 8765` + curl: `/` returns `<!doctype html>` page head; `/catalog.json` returns JSON starting with `generatedAt`, `usdToCop`, `items`.

Deviations / rationale:
- Node 22 `node --test scripts/` fails (directory treated as module path); `npm test` and the workflow use `node --test "scripts/*.test.mjs"`.
- pokemontcg.io returned HTTP 502 on first run; update script retries up to 4 attempts with growing delay before failing (catalog.json untouched on failure, temp file + rename).

- Commit dba954a (T1–T3). Native review: high risk, 4 lenses, consent granted, APPROVED and acknowledged (lineage review-589366349c081d52).
- Advisory follow-ups (non-blocking): missing cards silently dropped and auto-published; manual price ignored if not integer; requested variant with no price falls to min instead of other variants; NaN on bad config; generatedAt forces weekly commit; README variant order wording.

- T3b — Fixed editable rate (user request): `usdToCop: 3200` in config.json, live FX fetch removed, script exits 1 on invalid rate. Commit e78964c. Route inline (one mechanical file). Native review: high, 4 lenses, granted, APPROVED + acknowledged (lineage review-34349cc5ae466fc2). `npm run prices`: 6 items, 1 USD = 3200 COP.

- T4 — Hardening (delegated writer). New `scripts/catalog.mjs` (validateConfig, validateSingles, buildItems, catalogChanged) + `scripts/catalog.test.mjs`; `pickPrice` falls back to the first priced variant; `update-prices.mjs` is thin I/O glue that lists every error, exits 1 and leaves catalog.json untouched; writes only when items/usdToCop change. Observed 2026-10-16:
  - RED: `node --test "scripts/*.test.mjs"`: 6 tests, 4 pass, 2 fail (catalog.mjs missing; new variant-fallback test).
  - GREEN: `node --test "scripts/*.test.mjs"`: 12 tests, 12 pass, 0 fail.
  - `npm run -s prices` (after three 5xx retries): `catalog.json unchanged (6 items, 1 USD = 3200 COP)`, exit 0; second run identical, `cmp` equal.
  - Bogus `zz-999` in singles.json: `card zz-999 not found on pokemontcg.io`, exit 1, catalog.json byte-identical; singles.json restored (`git diff --quiet`).
  - README documents error output and no-op behavior.

- T4 commit a98eb4b. Native review: high, 4 lenses, granted, APPROVED + acknowledged (lineage review-f83f0a6e8c0509ba). Parent spot check: 12/12 tests; changed-rate run rewrote catalog.json (restored).
- Advisory follow-ups: corrupt catalog.json crashes unformatted; variant substitution shows fallback variant instead of owned one; one unpriced card blocks the whole publish (by design).

- T5 commit cbe7aae. RED 12/1 → GREEN 13/0. Headless screenshot desktop+mobile OK. Review assess: medium, under_budget (pending in slice since a98eb4b).

## Next step
Publish on GitHub Pages (user decision).
