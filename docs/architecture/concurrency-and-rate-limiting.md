# Concurrency and rate limiting

How ninjagoldfinch.lol runs riot-proxy calls in parallel, bounds how long they take, shares in-memory fetches, and behaves when riot-proxy or Riot says "slow down".

## Process model

The site is one Node process (`/usr/bin/node build` under systemd, owner-supplied unit) with no worker pool, queue or background job. Concurrency is the Node event loop: each request's load awaits its riot-proxy calls, and many requests can be in flight at once. Nothing in the repo limits how many concurrent requests the site accepts; adapter-node's timeouts (`SHUTDOWN_TIMEOUT` 30 s, `IDLE_TIMEOUT` 0, and the unset `KEEP_ALIVE_TIMEOUT` and `HEADERS_TIMEOUT`) are left at their defaults (`build/server/adapter-node-env.js:4-19`, inventory section 7).

## Parallel calls per page

Within one page, independent calls run together with `Promise.all`:

| Page              | Calls in parallel                                                      | Then                                                            | Source                                    |
| ----------------- | ---------------------------------------------------------------------- | --------------------------------------------------------------- | ----------------------------------------- |
| profile           | — (profile first, it supplies the `puuid` and platform)                | match page + current patch, in parallel; then Data Dragon names | `src/lib/server/profile.ts:76-106`        |
| match             | match + timeline + patch versions                                      | Data Dragon names + CommunityDragon shards, in parallel         | `src/lib/server/match.ts:41-69`           |
| champion table    | table + patch list + current patch                                     | Data Dragon names                                               | `src/lib/server/champions.ts:37-49`       |
| champion page     | detail + builds + matchups + patch list (after resolving the champion) | —                                                               | `src/lib/server/champion-page.ts:121-140` |
| Data Dragon names | `champion`, `item`, `summoner`, `runesReforged`, `queues`              | —                                                               | `src/lib/server/static-data.ts:43-49`     |

ADR-039 measured a cold champion page at about the sum of its four riot-proxy reads rather than the slowest one, which suggests riot-proxy serialises them or they compete for CPU; it was not confirmed (`docs/DECISIONS.md:529`).

## Shared fetches

Three lookups are held in process memory and shared by concurrent requests. Each stores the promise, not the result, so callers that arrive while a fetch is in flight wait on the same request. A failed fetch is dropped so the next page tries again.

| Lookup          | Key   | Lifetime                | Source                                |
| --------------- | ----- | ----------------------- | ------------------------------------- |
| `patchVersions` | none  | `PATCH_TTL_MS` = 5 min  | `src/lib/server/patch.ts:45-66`       |
| `staticNames`   | patch | until the patch changes | `src/lib/server/static-data.ts:25-37` |
| `statShards`    | patch | until the patch changes | `src/lib/server/cdragon.ts:9-39`      |

Riot player data and analytics are never held by the site (`docs/DECISIONS.md:560`, ADR-041).

## Deadlines and failures

Every riot-proxy call carries a deadline from `proxyBudget`: 5 s for `/v1/lol/analytics/*` and `/v1/static/*`, 30 s for everything else. The body is read inside the deadline, and a caller's own abort still applies (`src/lib/server/proxy.ts:68-134`). There are no retries in the site. The 30 s budget leaves room for riot-proxy's own Riot client, which allows 25 s per request (`riot-proxy:src/riot/client.rs:22-24`). CommunityDragon's `perks.json` fetch has its own 5 s deadline, `CDRAGON_BUDGET_MS`, body included (`src/lib/server/cdragon.ts:11-32`).

`withTimeout` races the fetch, and then the body read, against a promise that only its own timer or the caller's abort rejects; either one also aborts the fetch (`src/lib/server/proxy.ts:94-134`). Any throw other than the caller's own abort becomes `error(503)`: a spent deadline, a refused connection, a DNS failure, a body that breaks off. The caller's own abort passes through as it was.

This state diagram shows what one riot-proxy call can end as, and what the page does with it.

```mermaid
stateDiagram-v2
  [*] --> Sent
  Sent --> Ok: 2xx within budget
  Sent --> ErrorResponse: 4xx or 5xx within budget
  Sent --> TimedOut: budget spent
  Sent --> Threw: riot-proxy unreachable or body broke off
  Ok --> [*]
  ErrorResponse --> Classified: classifyProxyError
  Classified --> PageError: essential call
  Classified --> SectionNotice: optional call
  TimedOut --> PageError: error 503
  TimedOut --> SectionNotice: optional call, 503 response
  Threw --> PageError: error 503
  Threw --> SectionNotice: optional call, 503 response
  PageError --> [*]
  SectionNotice --> [*]
```

`optional()` turns a thrown or timed-out call into a 503 response for that call alone, so the loader's "not ok" branch handles it (`src/lib/server/errors.ts:41-58`). Essential calls go through `toHttpError`, which throws a SvelteKit error with status 404, 429 or 503 (`src/lib/server/errors.ts:16-39`). An essential call that times out or cannot reach riot-proxy throws the client's 503, so the page is a 503 (`src/lib/server/proxy.ts:124-128`). Observed 2026-10-20, before RV-03: a hung riot-proxy gave 503 after 5.0 s on `/champions` and 30.0 s on profile and match pages; a refused connection then gave 500, which RV-03 changed to 503.

Fixed in RV-03: on 2026-10-20 one match page request against a riot-proxy that accepted connections but never answered did not finish at all, because one call's deadline never fired. The old `withTimeout` passed an `AbortSignal.any` of the caller's signal and `AbortSignal.timeout` to `new Request(…, { signal })`, which follows the signal through a weak reference. A call nothing else held could be garbage collected before the abort reached it, so its promise never settled. Under repeated garbage collection the old code hung 200 of 200 times and the new code 0 of 200. A unit test now fires 20 hung calls while collecting garbage every 1 ms (`tests/unit/proxy.test.ts:154-169`).

## Rate limits that apply to the site

The site has no rate limiter of its own. Three limits act on its traffic:

| Limit                                        | Where      | What happens                                                                                                                                                      | Source                                                                      |
| -------------------------------------------- | ---------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| Consumer quota for `ninjagoldfinch-lol-prod` | riot-proxy | Sliding 60 s window of `quota_per_min` requests (default 600). Over quota: `QUOTA_EXCEEDED`, HTTP 429, `Retry-After`. Held in memory, reset on riot-proxy restart | `riot-proxy:src/http/quota.rs:1-8,97-135`, `riot-proxy:src/consumers.rs:14` |
| Riot API rate limits                         | riot-proxy | Per routing value and method. An interactive request waits up to 2 s; then a cached copy is served as `STALE`, or `RATE_LIMITED` (HTTP 503)                       | `riot-proxy:src/config.rs:716`, `riot-proxy:src/fetcher.rs:455-466`         |
| Refresh window                               | riot-proxy | One `refresh=true` per player and part per 60 s; inside the window the cached copy is returned with `refreshAvailableIn`                                          | `riot-proxy:src/routes/players/refresh.rs:17-18,43-71`                      |

Each riot-proxy call counts against the quota, including static and analytics calls, because every read route is metered (`riot-proxy:src/http/auth.rs:318-343`, `riot-proxy:src/routes/docs.rs:118-126`). A cold profile view costs two to eight calls (profile, match page, versions, and the five Data Dragon files on the first view of a patch); a warm one costs two.

> **TODO (unverified):** the `quota_per_min` actually set for `ninjagoldfinch-lol-prod`. Run `riot-proxy key list` on `ngf-prod-syd1`. Code default is 600.

How the site reacts, from `classifyProxyError` (`src/lib/server/errors.ts:16-33`):

- `QUOTA_EXCEEDED` and `RATE_LIMITED` (and any HTTP 429) become a **429** page, "Too many requests … Try again in N seconds". N comes from the error body's `retryAfter`, else the `Retry-After` header; without either the page says "a minute" (`src/lib/domain/error-view.ts:15-17`). riot-proxy sends `RATE_LIMITED` as HTTP 503, so the site goes by the code, not the status.
- On the profile, a rate-limited match page shows the same message in the match-history section while the header still renders (`src/lib/server/profile.ts:114-119`).
- The Refresh button is disabled while `refreshAvailableIn` is above zero (`docs/DECISIONS.md:155`).
- Error and form-post responses are never cached at the edge, so a passing rate limit is not served to later visitors (`src/lib/server/cache.ts:24-34`).

At the edge, the plan calls for a Cloudflare rate-limiting rule on `/summoner/*` and `/match/*` (`docs/IMPLEMENTATION.md:387`, P5-02).

> **TODO (unverified):** whether that Cloudflare rate-limiting rule exists in production. P5-02 is not ticked in `docs/PROGRESS.md`; check the Cloudflare dashboard.

## Backpressure

There is none in the site beyond the deadlines: a slow riot-proxy holds each affected request for at most 5 s or 30 s before the visitor sees an error. The edge cache is the main shield: repeat views within `s-maxage` never reach the host (`src/lib/server/cache.ts:5-11`).

---

**Sources:** `src/lib/server/proxy.ts:L68-L153`, `src/lib/server/errors.ts:L16-L58`, `src/lib/server/patch.ts:L45-L66`, `src/lib/server/static-data.ts:L25-L49`, `src/lib/server/cdragon.ts:L9-L39`, `src/lib/server/profile.ts:L76-L119`, `src/lib/server/match.ts:L41-L69`, `src/lib/server/champions.ts:L37-L49`, `src/lib/server/champion-page.ts:L121-L140`, `src/lib/server/cache.ts:L5-L34`, `src/lib/domain/error-view.ts:L7-L31`, `src/hooks.server.ts:L20-L25`, `tests/unit/proxy.test.ts:L154-L169`, `build/server/adapter-node-env.js:L4-L19`, `docs/DECISIONS.md:L155,L529,L560`, `docs/IMPLEMENTATION.md:L387`, `riot-proxy:src/http/quota.rs:L1-L135`, `riot-proxy:src/consumers.rs:L14`, `riot-proxy:src/http/auth.rs:L318-L343`, `riot-proxy:src/config.rs:L716`, `riot-proxy:src/fetcher.rs:L455-L466`, `riot-proxy:src/routes/players/refresh.rs:L17-L71`, `riot-proxy:src/riot/client.rs:L22-L24`
**Last verified:** 2026-11-03 against commit `03faa33`
