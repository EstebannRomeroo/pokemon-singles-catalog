# Feature: multi-tcg-catalog

## Objective
Sell Pokémon, Magic and One Piece singles from one catalog, with one section per TCG, priced from one free source.

## Problem / Why
pokemontcg.io is deprecated (no new keys, existing keys end 2027-03-01) and has no prices for new sets (30th Celebration Lugia). The owner also sells Magic and a few cheap One Piece cards. TCGCSV (tcgcsv.com) publishes a free daily dump of TCGPlayer data for all three games (Pokemon category 3, Magic 1, One Piece 68), including new sets and sealed product.

## Scope
- Replace pokemontcg.io with TCGCSV in the update script.
- Inventory entries identify a product by game + TCGPlayer group id + product id; keep qty, variant, condition, manual price.
- catalog.json items carry `game`.
- Page: one section per TCG (tabs Todos / Pokémon / Magic / One Piece, linkable via URL hash); PDF prints the selected section.
- Migrate the two owned cards (Ethan's Ho-Oh ex sv10-230, Lugia 30th Classic Collection, manual 400000).

## Constraints
All free. No backend, no DB, no auth. Node 22 stdlib only, zero npm dependencies. Strict palette and light theme from current index.html stay.

## Tasks
- [x] T1 — TCGCSV data source + inventory format + tests + README + workflow (route: delegated writer; trigger: 2+ non-trivial files)
- [x] T2 — Per-TCG sections in index.html (route: same delegated writer)

## Acceptance criteria
- `npm test` passes.
- `npm run prices` builds catalog.json from TCGCSV for the migrated inventory; Lugia keeps manual 400000; Ho-Oh priced from TCGPlayer market.
- Invalid inventory, unknown product, or missing price still fail loudly and leave catalog.json untouched.
- Page shows a section per TCG that has cards; PDF prints only the selected section.

## Delivery strategy
ask-on-risk. Forecast ~350 authored lines.

## Progress / Evidence
T1+T2 by delegated writer, observed 2026-10-16:
- RED: `npm test` 3 pass / 4 fail (cardKey missing, pickPrice row shape). GREEN: 16 pass / 0 fail (parent re-ran: 16/16).
- `npm run -s prices`: first `tcgcsv.com HTTP 401` (default Node User-Agent rejected); custom User-Agent fixed it. `catalog.json: 2 items`; rerun `unchanged`.
- Items: pokemon-633030 Ethan's Ho-Oh ex (group 24269) Holofoil 140.63 USD -> 450500 COP; pokemon-714386 Lugia (group 24837) market 175.52, manual 400000.
- Negative: product 999999999 -> `card pokemon/999999999 not found on tcgcsv.com`, exit 1, catalog.json byte-identical.
- Screenshots desktop/mobile + PDF checked; tabs wrap on mobile; #magic PDF only Magic (mock catalog).
- Deviations: image `_400w.jpg`, imageLarge `_in_1000x1000.jpg`; no-image placeholder for presale; trailing " - <number>" stripped from names; manual price validated before fetch.
- Commits: 13aef94 (T1), d0ce613 (T2).
- Native review: high, 4 lenses, granted, APPROVED + acknowledged (lineage review-e8613367067e665a).
- Advisory follow-ups: null set name if group missing from groups list breaks search (WARNING x2); 429 not retried; fetch path untested; dup key ignores group; variant id collision; UA name stale.
- Reference noted: ~/workspace/digital-binder-tcg uses per-card `seccion` and /coleccion/<name> pages; its cards are no longer owned.

## Next step
Review assessment; then user sends Magic and One Piece inventory.
