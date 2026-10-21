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
- [ ] T2 — `admin.html`: set picker + number search wired to the proxy (route: delegated writer; trigger: prepare-and-write)
- [ ] T3 — instant price for a card not yet in `catalog.json` (same writer as T2)
- [ ] T4 — README: document `npm run serve` and the new flow (route: inline)
- [ ] T5 — native review of the candidate

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
T2: wire the set picker and number search into `admin.html` on top of this proxy.
