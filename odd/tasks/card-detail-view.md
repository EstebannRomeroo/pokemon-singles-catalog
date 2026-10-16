# Feature: card-detail-view

## Objective
Clicking a card opens a detail view (large image + description panel), modeled on the lightbox in ~/workspace/digital-binder-tcg (src/scripts/app.ts `lightbox`, `buildDetailPanel`; src/styles/binder.css `.lightbox`, `.lb-*`).

## Problem / Why
The owner likes the binder's card viewer. Today a card click only opens the raw image in a new tab, and buyers cannot read the card text.

## Scope
- Update script stores a sanitized `details` list per item from TCGCSV `extendedData` (plain text, no HTML).
- index.html: accessible viewer with image, name, set/number/rarity, data grid, card text/attacks, qty/condition/language, price, and the WhatsApp button when configured. Zoom from the thumbnail via View Transitions where supported, fade otherwise; Escape, backdrop click and close button dismiss; focus returns to the card.

## Constraints
Plain HTML, no build step, Node 22 stdlib only, zero npm deps (Astro migration declined: it would only bundle the same client JS). Strict palette, light theme. Never inject TCGCSV HTML into the DOM.

## Tasks
- [x] T1 — `details` extraction + tests (route: delegated writer; trigger: 2+ non-trivial files)
- [x] T2 — Detail viewer in index.html (route: same delegated writer)

## Acceptance criteria
- `npm test` passes, including details sanitization.
- Clicking any card opens the viewer with its text; keyboard and backdrop close it; mobile stacks image over panel without horizontal scroll.
- Print/PDF unaffected.

## Delivery strategy
ask-on-risk. Forecast ~300 authored lines.

## Progress / Evidence
Delegated writer, observed 2026-10-16:
- RED: `npm test` SyntaxError (no export cardDetails). GREEN: 21/21 (parent re-ran: 21/21).
- `npm run -s prices`: 20 items; details present for Pokémon (Card Type, HP, Stage, Attacks) and Magic (Rules Text, P/T).
- CDP checks desktop 1100x900 + mobile 390x844: click/Enter open, Escape/backdrop/close button close, focus returns, no horizontal scroll, no console errors; print media hides dialog.
- Parent viewed desktop-open and mobile-open screenshots: layout matches binder (image left/top, panel right/below).
- Follow-up: labels are TCGPlayer English displayNames (Card Type, Rules Text Contains); Spanish label map is a small later task.

## Next step
Review assessment; optional Spanish label map.
