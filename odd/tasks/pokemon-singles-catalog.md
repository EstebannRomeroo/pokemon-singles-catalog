# Feature: pokemon-singles-catalog

## Objective
Free, static catalog of Pokémon TCG singles with prices in COP.

## Problem / Why
Owner needs a shareable price list that is easy to update. Collectr has no public API, so prices come from pokemontcg.io (TCGPlayer market USD, free).

## Scope
- Inventory in `singles.json` (card id, qty, optional variant/condition/manual price).
- `scripts/update-prices.mjs` builds `catalog.json` from pokemontcg.io + free USD→COP rate.
- Price rule: `max(minPrice, round(usd * rate * margin))`; manual price overrides. minPrice = 2000 COP.
- `index.html` (no build step) renders catalog with search and sort.
- GitHub Actions weekly job refreshes prices; GitHub Pages hosts it.

## Constraints
All free. No backend, no DB, no auth. Node 22 stdlib only, zero npm dependencies.

## Tasks
- [x] T1 — Price logic + update script + test (route: delegated writer; trigger: 2+ non-trivial files)
- [x] T2 — Static page `index.html` (same writer)
- [x] T3 — GitHub Actions workflow + README (same writer)

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

## Next step
Parent commits T1–T3; then publish on GitHub Pages.
