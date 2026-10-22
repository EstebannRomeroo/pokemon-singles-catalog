# Feature: order-cart

## Objective
Let buyers collect several cards in a cart on the public catalog and copy one order message to send to the store.

## Decision
Order channel: copy only (user choice, 2026-10-22). The cart builds the text and copies it; no WhatsApp link, no backend. The buyer pastes it in whatever chat they use with the store.

## Scope
- `scripts/cart.mjs` + `scripts/cart.test.mjs`: pure cart rules (add capped at stock, set qty, reconcile a stored cart against the current catalog, lines, order message).
- `index.html`: "Agregar al carrito" on each card and in the viewer, floating cart button, cart panel (side panel on desktop, bottom sheet on phones), copy with a selectable-text fallback. Cart kept in localStorage as `{ id: copies }`, prices always read from the catalog.

## Tasks
- [x] T1 — cart rules with tests, RED observed (module missing) then GREEN 9/9 (route: inline)
- [x] T2 — cart UI in index.html (route: inline; parent already held index.html) — commit bb608da, native review approved
- [x] T3 — review follow-ups: keep keyboard focus after cart edits; load cart.mjs separately so a failure only hides the cart; keep a line in place when its quantity changes (bug found while verifying, RED then GREEN) (route: inline)
- [x] T4 — card cart button keeps keyboard focus at the stock limit (aria-disabled instead of disabled) (route: inline)

## Checks
- `npm test`: cart 10/10; the 3 logo/favicon failures predate this work.
- Headless Chromium at 390px and 1280px: stock cap disables the button, badge counts copies, total and copied text correct, minus button updates, cart survives reload, no page errors.
- T3: focus stays on the same line's control, moves to the next line after a removal, and to the close button when the cart empties; with cart.mjs blocked the catalog renders all 230 cards without cart buttons.
- T4: after adding the last copy by keyboard the button keeps focus, reports aria-disabled with an explanatory label, extra Enter adds nothing, Tab moves on.
