# Feature: card-search

## Objective
Make adding a card fast: type the set and the number printed on the card instead of two opaque TCGCSV ids (`groupId` / `productId`). The panel resolves the card, shows its real name, and adds it.

## Problem / Why
Today the add form asks for `group` (24587) and `product` (684320). Neither is printed on a card. Finding them means browsing 220 Pokémon groups and ~156 products per group by hand. That is the bottleneck that makes adding a card slow, and it is the last manual step left in the inventory flow.

Supabase was considered and rejected: the problem is finding a card in an external catalog, not storing rows. It would add an account, an API key in a static page, a backend, and a new failure point while leaving the two unknown ids unsolved.

## Scope
- `scripts/serve.mjs`: a small Node server replacing `python3 -m http.server` for the panel. It serves the repo files the pages fetch and proxies TCGCSV routes.
- The proxy exists because tcgcsv.com sends no CORS headers (its preflight answers 403), so the browser cannot call it. Node has no CORS restriction.
- `admin.html`: replace the "Grupo" field with a set picker + a card-number field that resolves the card and shows its name and price before adding.
- `npm run serve` replaces the python command.
- Future `npm run prices` stays unchanged; the proxy reuses the same tcgcsv.com base and `User-Agent`.

## Constraints
- Zero dependencies, Node 22 stdlib only. No account, no key, no external backend.
- The proxy forwards only known TCGCSV route shapes; it must never become an open proxy.
- Static serving is allowlisted: `.git/config`, `package.json` and other private repo files must not be reachable.
- The price source stays TCGCSV; TCGdex is not usable because it carries no market prices.

## Tasks
- [x] T1 — `scripts/serve.mjs` + tests: static serving, TCGCSV proxy, number matcher (route: inline, TDD)
- [x] T2 — `admin.html`: set picker + number search wired to the proxy (route: delegated writer; trigger: prepare-and-write)
- [x] T3 — instant price for a card not yet in `catalog.json` (same writer as T2)
- [x] T4 — README: document `npm run serve` and the new flow (route: inline)
- [x] T5 — native review of the candidate

## Acceptance criteria
- `npm test` passes, including the new server tests.
- `npm run serve` serves `admin.html`, `singles.json`, `catalog.json` and the `scripts/*.mjs` imports.
- `/tcgplayer/{cat}/{group}/products` returns the products through the proxy, so the browser never needs CORS.
- `/../.git/config`, `/../package.json` and any private repo file answer 404, including a raw un-normalized request.
- A proxied route with a query string answers 404.
- Typing a set code and a card number lists the matching card(s) with name, set, number and price.

## Delivery strategy
ask-on-risk. Forecast ~350 authored lines (server + tests + panel wiring + README).

## Progress / Evidence

### T1 — companion server (2026-10-21, inline, TDD)

Strict TDD: `scripts/serve.test.mjs` was written first and observed RED (`Cannot find module .../scripts/serve.mjs`), then `scripts/serve.mjs` to GREEN.

Files:
- `scripts/serve.mjs` — static file server + TCGCSV proxy. Reuses the same `https://tcgcsv.com` base and the `User-Agent: pokemon-singles-catalog` header as `scripts/update-prices.mjs` (the default Node UA gets a 401). Exports the pure helpers; the listener starts only when the file is run directly, so importing it in tests binds no port.
- `scripts/serve.test.mjs` — 10 tests.
- `package.json` — new `serve` script.

Commands (foreground):
- `npm test` → 45 tests, 45 pass, 0 fail (35 pre-existing + 10 new).
- `node --check scripts/serve.mjs` → valid ESM.

End-to-end against the real server:
- static: `admin.html`, `singles.json`, `catalog.json`, `config.json`, `scripts/inventory.mjs`, `scripts/catalog.mjs` → all 200.
- proxy: `/tcgplayer/3/groups` → 220 groups; `/tcgplayer/3/24587/products` → 156 products with `Potion 684320` present. This is the exact call the browser could not make.

Two real defects the tests and the probes caught (both fixed, both now covered by a test):
1. Importing `serve.mjs` in the test started the listener and hit `EADDRINUSE` against the running server. Fixed by gating `listen` behind the direct-execution check.
2. Path traversal served private repo files: a raw un-normalized `GET /../package.json` returned the file with 200, and `/../.git/config` too. Confining to the repo root was not enough because those files live inside it. Fixed with an explicit public allowlist (`/`, the four data pages, `/scripts/*.mjs` minus `*.test.mjs`, `/assets/`). A raw request now answers 404.
3. The query-string guard was dead code: it checked `URL.pathname`, which never contains `?`, so `/tcgplayer/3/groups?x=1` still proxied. The unit test passed because it fed the guard a string the runtime never produces. Fixed with `isAllowedProxyRequest`, which checks the raw request URL; the test now covers the real shape.

## Next step
T5: run the native review on this candidate.

### T2 + T3 — set picker, number search, instant price (2026-10-21, delegated writer)

Files:
- `admin.html` — the `Grupo` and `Producto` numeric inputs are gone. In their place: a `<select id="f-set">` populated on demand from the proxy (labelled `NAME (ABBREVIATION)`, with `#f-set-filter` narrowing the 220 options client-side), and `#f-number` where the printed number is typed. `resolveCard()` fetches the group's products and prices in one place, filters by number mirroring the server's `filterProductByNumber` rule (part before `/`, leading zeros dropped), and either fills the hidden `groupId`/`productId` or lists the printings as choices.
- The price shown at add time reuses `pickPrice` and `toCop` imported from `scripts/price.mjs` with `config.json`, so it cannot drift from the published number. A missing price reads `sin precio` instead of a bare dash.

Verification (observed):
- `npm test` → 45 pass, 0 fail.
- `node --check` on the extracted inline script → valid ESM.
- The three imports the panel makes (`scripts/inventory.mjs`, `scripts/catalog.mjs`, `scripts/price.mjs`) and `config.json` all answer 200 through the server.
- End-to-end, driving the shipped `admin.html` inline script under a DOM shim against the live proxy: `083` in `24587` (ME03: Perfect Order) resolves to `Potion · ME03: Perfect Order · #083/088 · Precio TCGCSV: $ 2.000`, and `Agregar` becomes enabled. `83` and `083/088` resolve to the same card. `99999` reports `El número 99999 no está en ME03: Perfect Order (POR).` and keeps `Agregar` disabled.

A false alarm worth recording: an early probe reported that an empty field kept showing the previous resolution. That was a defect in the probe, not the panel — the shim set `textContent` without clearing the node's children, so the reader picked up stale child nodes. Re-run with real DOM semantics, an empty field yields `Escribe el número de la carta.` with `Agregar` disabled. Same class of mistake as the dead query-string guard in T1: a test that passes or fails for the wrong reason proves nothing.

### T4 — README and stale instructions (2026-10-21, inline)

- `README.md`: `python3 -m http.server 8000` is replaced by `npm run serve` in both sections, with the proxy's reason and its allowlist documented, plus a step-by-step for adding a card by set and number.
- `admin.html:535`: the load-failure message still told the user to run `python3 -m http.server 8000`. Now it says `npm run serve`. Three such messages in the panel are consistent again.

Historical documents (`odd/tasks/inventory-panel.md`, `odd/tasks/pokemon-singles-catalog.md`) still mention `python3` and are intentionally left alone: they record what was true when they were written.

### T5 — native review (2026-10-21)

Lineage `review-3a4e56768dfd802e`, risk medium (reason: `executable_change` in `admin.html`), one lens `review-reliability`, frozen target `sha256:6d43a6b4…`, 6 changed paths, 603 changed lines. Consent relayed and granted by the user. Outcome **approved**; acknowledgement burned (`authority: burned`, `consumed_revision: sha256:4676885b…`).

The reviewer inspected the frozen candidate only, through `review inspect-candidate` (name-status, numstat, patch), never the live worktree.

Four non-blocking advisories. None opened a correction; none reopens this review. They are separate later work, not a reason to re-run review on this candidate.

- **R3-201** (WARNING, `admin.html:245-256`, deterministic, introduced) — `loadGroups()` writes `groups` and `groupsGame` after an `await` with no sequencing guard (no request id, no `AbortController`, no post-await game comparison). Two overlapping game changes can leave the rendered `<select>` out of step with `groupsGame`; `groupData()` then builds its request from the newly selected game's category with a `groupId` belonging to the previously rendered game, and the call fails against the wrong category.
- **R3-202** (WARNING, `scripts/serve.mjs:125`, deterministic, introduced) — `server.listen(port, ...)` omits the host, so the process binds every interface (`ss` shows `*:8000`) while the startup log claims `localhost`. Anything on the network can reach the panel, the catalog and the proxy. The proxy destination is allowlisted and the server never writes to disk, so this is unintended exposure, not remote execution — but the misleading log line hides it.
- **R3-203** (WARNING, `scripts/serve.mjs:104`, deterministic, introduced) — the handler dispatches on path only and never inspects `req.method`; `POST`, `PUT` and `DELETE` answer 200 with content instead of 405. No handler mutates state, which caps the impact, but a read-only server should refuse methods it does not implement.
- **R3-204** (SUGGESTION, `scripts/serve.mjs:132`, deterministic, introduced) — no trailing newline. Nothing enforces one; cosmetic.

### Next step
No review work remains on this candidate. The four advisories above are independent, non-blocking follow-up work; R3-201 and R3-202 are the two worth doing first.


