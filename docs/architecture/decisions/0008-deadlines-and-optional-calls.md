# 0008: A deadline on every riot-proxy call; optional calls fail on their own

Each riot-proxy call has a time budget by route, and a call a page can do without degrades only its own section when it fails, times out or throws.

## Context

The proxy client had no timeout, so a riot-proxy that stopped answering held pages until the socket gave up, and a thrown call failed the whole page even where it was meant to be optional (ADR-040, `docs/DECISIONS.md:546`). riot-proxy's player and match routes may wait on Riot for up to 25 s per request.

## Decision

- `proxyBudget`: 5 s for `/v1/lol/analytics/*` and `/v1/static/*`, 30 s otherwise (`src/lib/server/proxy.ts:68-77`).
- `withTimeout` combines the caller's signal with `AbortSignal.timeout(budget)` and reads the body inside the deadline; a spent budget is `error(503)`. (Replaced in RV-03; see Status.)
- `optional()` turns a throw into a 503 response for that call alone (`src/lib/server/errors.ts:41-58`). Optional: the profile's match page, the match timeline, the table's patch list, the champion page's builds, matchups and patch list.

## Consequences

- A hung riot-proxy costs a page at most 5 s or 30 s (`docs/DECISIONS.md:554`).
- No setting: the budgets are constants.

## Status

Accepted (SPD-05, PR #63).

2026-11-03, RV-03: the mechanism was replaced, the decision stands. `AbortSignal.timeout` could fail to fire: `new Request(…, { signal })` holds its signal only weakly, so a call nothing else held could be garbage collected before the abort reached it, and the page never finished. `withTimeout` now races the fetch and the body read against a promise its own `setTimeout` or the caller's abort rejects, and aborts its own `AbortController`. Any failure other than the caller's own abort is now a 503, a refused connection included (it was a 500). Deadlines are logged as `proxy timeout` (`src/lib/server/proxy.ts:81-134`). The CommunityDragon `perks.json` fetch gained a 5 s deadline too (`src/lib/server/cdragon.ts:11-32`).

## Evidence

`tests/unit/proxy.test.ts` (including 20 hung calls under repeated garbage collection, `tests/unit/proxy.test.ts:154-169`), `tests/unit/errors.test.ts`, `tests/unit/cdragon.test.ts:49-66`, loader tests.

---

**Sources:** `docs/DECISIONS.md:L542-L554`, `src/lib/server/proxy.ts:L68-L134`, `src/lib/server/cdragon.ts:L11-L32`, `tests/unit/proxy.test.ts:L154-L169`, `src/lib/server/errors.ts:L41-L58`
**Last verified:** 2026-11-03 against commit `2948c82`
