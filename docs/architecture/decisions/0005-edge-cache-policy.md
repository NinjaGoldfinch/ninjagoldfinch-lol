# 0005: Pages are cached at Cloudflare, with one central policy table

Repeat views are served by Cloudflare's edge cache, driven by `Cache-Control` headers from one module, with errors, form posts, redirects and incomplete pages never cached.

## Context

riot-proxy's capacity and the Riot rate budget are the scarce resources; most page views repeat recent ones. The plan set starting values: profile 60 s, finished match 1 day, analytics 10 min (`docs/IMPLEMENTATION.md:244`).

## Decision

- Five policies in `src/lib/server/cache.ts:5-16`: `profile` (`s-maxage=60, stale-while-revalidate=300`), `match` (`s-maxage=86400, stale-while-revalidate=86400`), `analytics` (`s-maxage=600, stale-while-revalidate=600`), `notFound` (`s-maxage=60`), `none` (`no-store`).
- Every load sets one through `cacheControl()` (`CLAUDE.md:62`).
- The `handle` hook overrides: non-GET/HEAD and errors are `no-store`, 404 is `notFound` (`src/hooks.server.ts:6-15`, `src/lib/server/cache.ts:29-34`, ADR-017).
- After those rules, a response with no `Cache-Control` gets `no-store`. That covers redirects thrown before a load set a policy (`src/hooks.server.ts:8-13`, ADR-045).
- A page with a failed optional section is sent `no-store`: a profile without matches; a match without its timeline, lookups or stat shards; a champions page without its patch list or lookups; a champion page without its set builds, matchups or patch list. The match and champion loads return `complete` for this (ADR-045).
- A champion's name redirects with 308; a tidied query with 307, so a later change of default is not stuck in browsers (ADR-045).
- One URL per view: loads redirect to a canonical query so the edge holds one copy (ADR-033, ADR-037).

## Consequences

- "Updated N minutes ago" can be up to the cache age older than it says (`docs/DECISIONS.md:233`).
- Refresh is a POST so it is never cached (ADR-012).
- Cloudflare's cache key includes the query string, checked from outside on 2026-10-19 (`docs/DECISIONS.md:577`).
- `/` and `/about` are prerendered, so they are static files outside `handle` and its `no-store` default (`src/routes/+page.ts:3`, ADR-045).
- A degraded page costs riot-proxy a request per view until it recovers, as an error page does.
- SvelteKit sends `__data.json` with `private, no-store` unless the load set a policy, which then replaces it (checked in SvelteKit 3.0.1's source and against `node build` on 2026-11-03).

## Status

Accepted; extended by ADR-045. Whether Cloudflare caches `__data.json` with a `public` policy is open (SPD-06).

## Evidence

`tests/unit/cache.test.ts`, `tests/unit/hooks.test.ts`, `tests/unit/match-loader.test.ts`, `tests/unit/champions-loader.test.ts`, `tests/unit/champion-page-loader.test.ts`, `tests/e2e/routes.test.ts`, `tests/e2e/match.test.ts` ("a match page is cacheable at the edge for a day").

---

**Sources:** `src/lib/server/cache.ts:L5-L34`, `src/hooks.server.ts:L6-L15`, `src/routes/+page.ts:L3`, `CLAUDE.md:L62`, `docs/IMPLEMENTATION.md:L244`, `docs/DECISIONS.md:L145-L157,L206-L215,L233,L577,L615-L628`
**Last verified:** 2026-11-03 against commit `99cb82c`
