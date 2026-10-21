# Feature: ui-ux-polish

## Objective
Fix the UI/UX rough edges of `index.html` (public catalog) and `admin.html` (local panel) on mobile and desktop.

## Problem / Why
- The admin set search keeps showing its result list after a set is picked, and the "Buscar set" input and "Grupo" select do not stay in sync.
- The admin inventory table is a 720px-wide horizontal scroll on phones.
- Small touch targets in the admin tray (28px remove button).
- Catalog search ignores accents ("pokemon" does not match "Pokémon") and card numbers.
- Card hover lift sticks after a tap on touch screens.

## Scope
`index.html`, `admin.html`. No new dependencies, no new files beyond this document.

## Tasks
- [x] T1 — admin set picker: collapse after pick, sync input/select, Enter picks first match, Escape closes (route: inline; parent already holds both files)
- [x] T2 — admin mobile: inventory rows as stacked cards under 640px, 44px touch targets (route: inline)
- [x] T3 — catalog: accent-insensitive search that also matches numbers; hover effects only on hover-capable devices (route: inline)

## Checks
- `npm test` stays green (no DOM tests exist; UI verified with headless Chromium screenshots at 390px and 1280px).

## Progress
- Branch `feat/ui-ux-polish`. T1–T3 verified in headless Chromium at 390px and 1280px: Enter on "darkhold" picks MDC, closes the list, syncs the select and focuses the card field; catalog search matches set codes; no horizontal overflow on mobile admin.
- `npm test`: 194 pass, 3 fail (image.test.mjs / images.test.mjs logo and favicon tests, already failing on main).
