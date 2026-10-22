# Feature: admin-preview-save

## Objective
Make inventory updates in `admin.html` faster and less error-prone: see each card's image, edit quantities directly, and save without downloading and replacing `singles.json` by hand.

## Problem / Why
- Card names are easy to confuse (several printings share a name); the panel shows no images.
- The inventory table has only "Vender" (−1) and "Quitar"; an exact quantity cannot be set.
- Saving means: export, download, replace the file in the repo. Slow and easy to forget.

## Scope
- `scripts/inventory.mjs`: `setQty` (exact quantity, positive integer).
- `scripts/serve.mjs`: `PUT /singles.json` writes the validated inventory to disk. Guarded: loopback client only, same-origin `Origin` only (blocks other websites posting to localhost), JSON body size limit, `validateSingles` before writing, atomic write (temp file + rename).
- `admin.html`: thumbnails in card choices, in the resolved card and in inventory rows, click to enlarge; quantity input per row; autosave after every change with a visible saved/unsaved/error state; export kept as a fallback.

## Constraints
- No new dependencies. Publishing stays `npm run deploy`.
- The write endpoint must never be reachable from another device or another site.

## Tasks
- [x] T1 — `setQty` + tests (route: inline, TDD; RED: missing export, then GREEN)
- [x] T2 — guarded `PUT /singles.json` + tests (route: inline, TDD; RED: missing export, then GREEN)
- [x] T3 — admin.html: previews, quantity input, autosave (route: inline; parent already holds admin.html)

## Checks
- `npm test` (3 logo/favicon failures predate this work).
- Headless Chromium against a server on a spare port: previews render, quantity edits persist to disk, cross-origin PUT rejected.

## Progress
- Branch `feat/admin-preview-save`.
- Catalog images all follow `tcgplayer-cdn.tcgplayer.com/product/<id>_400w.jpg` (230/230), so entries not yet in catalog.json still get a thumbnail.
- Endpoint probes (curl, server on a copy at port 8010): other Origin 403, no Origin 403, text/plain 403, invalid inventory 400.
- Chromium at 1280px and 390px: row thumbnails load, "ver carta" opens the large image, quantity edit autosaves to disk, 0 is refused with a Spanish message and the field reverts, search choices show 10/10 images. Restoring the quantity left the copy byte-identical to the real singles.json.
- Found while verifying: an older `npm run serve` answers PUT /singles.json with the file and 200 without writing, so the panel now requires `{ ok: true }` before showing "Guardado". Simulated old server shows "No se pudo guardar".
- `npm test`: 210 pass, 3 fail (logo/favicon tests, already failing on main).
- Native review approved 6bf12dc with follow-ups; fixed two of them:
  - Request body decoded per chunk could corrupt a multi-byte character split across chunks. `readBody` joins bytes before decoding (RED/GREEN unit test); an ~80 KB accented body saved intact end to end.
  - Autosave could report "Guardado" while a newer edit was still pending, so closing the tab would not warn. Saves now track a revision; a slowed-down save race showed the warning while pending and both edits on disk afterwards.
- `npm test`: 212 pass, 3 fail (same logo/favicon tests).
