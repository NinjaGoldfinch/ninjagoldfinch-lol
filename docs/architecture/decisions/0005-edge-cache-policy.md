# 0005: Pages are cached at Cloudflare, with one central policy table

Repeat views are served by Cloudflare's edge cache, driven by `Cache-Control` headers from one module, with errors and form posts never cached.

## Context

riot-proxy's capacity and the Riot rate budget are the scarce resources; most page views repeat recent ones. The plan set starting values: profile 60 s, finished match 1 day, analytics 10 min (`docs/IMPLEMENTATION.md:244`).

## Decision

- Five policies in `src/lib/server/cache.ts:5-16`: `profile` (`s-maxage=60, stale-while-revalidate=300`), `match` (`s-maxage=86400, stale-while-revalidate=86400`), `analytics` (`s-maxage=600, stale-while-revalidate=600`), `notFound` (`s-maxage=60`), `none` (`no-store`).
- Every load sets one through `cacheControl()` (`CLAUDE.md:62`).
- The `handle` hook overrides: non-GET/HEAD and errors are `no-store`, 404 is `notFound` (`src/hooks.server.ts:5-10`, `src/lib/server/cache.ts:29-34`, ADR-017).
- A page with a failed optional section is sent `no-store` (profile without matches, match without timeline).
- One URL per view: loads redirect to a canonical query so the edge holds one copy (ADR-033, ADR-037).

## Consequences

- "Updated N minutes ago" can be up to the cache age older than it says (`docs/DECISIONS.md:233`).
- Refresh is a POST so it is never cached (ADR-012).
- Cloudflare's cache key includes the query string, checked from outside on 2026-10-19 (`docs/DECISIONS.md:577`).
- `/` has no load and sends no `Cache-Control` (observed 2026-10-19).

## Status

Accepted. Whether Cloudflare caches `__data.json` is open (SPD-06).

## Evidence

`tests/unit/cache.test.ts`, `tests/unit/hooks.test.ts`, `tests/e2e/match.test.ts` ("a match page is cacheable at the edge for a day").

---

**Sources:** `src/lib/server/cache.ts:L5-L34`, `src/hooks.server.ts:L5-L10`, `CLAUDE.md:L62`, `docs/IMPLEMENTATION.md:L244`, `docs/DECISIONS.md:L145-L157,L206-L215,L233,L577`
**Last verified:** 2026-10-19 against commit `85d9cf8`
