# Performance

Where ninjagoldfinch.lol spends time on a request, the numbers measured so far, the constants that act as tuning knobs, and what to expect on the shared `ngf-prod-syd1`. For memory, disk and bandwidth see [deployment/capacity.md](../deployment/capacity.md).

## Where the time goes

A page's time is almost all riot-proxy's: the site's own rendering is a few milliseconds, and the edge cache answers repeat views without reaching the host at all.

| Page                 | riot-proxy calls (each chain in order, chains in parallel)                                                                            | Site work                                                            | Source                                                                  |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| `/summoner/{riotId}` | two chains together: profile, then match list (10 per page); current patch, then Data Dragon lookups if not held                      | shaping rows                                                         | `src/lib/server/profile.ts:76-114`, `src/lib/domain/match-filters.ts:7` |
| `/match/{matchId}`   | three chains together: match; timeline; current patch, then Data Dragon lookups and CommunityDragon `perks.json` together if not held | parsing match and timeline, builds, gold chart (the heaviest render) | `src/lib/server/match.ts:42-61`                                         |
| `/champions`         | three chains together: table; patch list; current patch, then Data Dragon lookups if not held                                         | summing tiers, sorting                                               | `src/lib/server/champions.ts:37-48`                                     |
| `/champions/{key}`   | current patch and Data Dragon lookups first (to resolve the champion), then detail, builds, matchups and patch list together          | shaping cards                                                        | `src/lib/server/champion-page.ts:86-148`                                |

No call waits for another it does not need: the current patch and its lookups depend on nothing the page asks for, so on the profile, match and champions pages they start alongside the page's own calls rather than after them (SPD-08). Shared lookups are held in memory so requests skip them: the current patch, and the Data Dragon names and CommunityDragon stat shards for up to two patches. They are loaded at start-up by the `init` hook, so the first visitor after a deploy does not wait for them. Once the held patch is older than 5 minutes it is still used at once while one background refresh asks riot-proxy again; a new patch is switched to only after its lookups have loaded. So once a patch is held, no request waits on `/v1/static/versions` or on lookups; only a cold start whose warm-up failed or has not finished does. Concurrent requests share one in-flight fetch, and a failed fetch is not kept (`src/hooks.server.ts:11-13`, `src/lib/server/patch.ts:51-146`, `src/lib/server/static-data.ts:22-51`, ADR-013, ADR-041, ADR-048).

The Data Dragon `item.json` alone is about 700 kB, which is why the reduced lookups are held rather than fetched per request (`src/lib/server/static-data.ts:22-25`).

## Where timings come from

The site times every request itself. `handle` runs each request inside `timeLoad`, and the `timeCalls` middleware records each riot-proxy call the request makes by its spec path template. A request slower than `SLOW_LOAD_MS` (100 ms), render included, logs one `slow load` line with its route id, its total and each call's time (`src/hooks.server.ts:19-21`, `src/lib/server/timing.ts:11,33-95`, ADR-046). The log is the only output: there is no `Server-Timing` header and no metrics endpoint. To read them on production, see [observability.md](./observability.md#finding-slow-pages).

Warm loads usually finish under the threshold and are not logged, so they are measured on the host with `curl -w '%{time_total}'` against the site's own port, as ADR-039 did. Cold and warm timings for each page type, measured on production on 2026-11-03, are in ADR-046: cold 256 ms (profile), 176 ms (match), 39 ms (champions), 42 ms (champion), 7 ms (search); warm 20–62 ms.

## Measured numbers

**Production** (ADR-039, measured 2026-10-15 on the production server, `docs/DECISIONS.md:523-529`):

| What                                                                                   | Time                                 |
| -------------------------------------------------------------------------------------- | ------------------------------------ |
| riot-proxy: table, patch list, versions (warm)                                         | 0.7–1.4 ms                           |
| riot-proxy: one champion's detail / builds / matchups / patches, first after a rebuild | 87 / 76 / 23 / 6 ms, then under 1 ms |
| Site: `/champions`, `/champions/ahri` and their `__data.json`, riot-proxy warm         | 8–15 ms                              |
| Site: a champion page's first view after a rebuild                                     | about 200 ms                         |
| Through Cloudflare                                                                     | `MISS` 55–69 ms, `HIT` 25–30 ms      |

Before ADR-039's riot-proxy changes, production's `/champions/__data.json` took 3.9 s (`docs/DECISIONS.md:521`).

**Production cold loads, before and after SPD-08** (from `slow load` lines, ADR-047): a cold profile took 204–222 ms with the static lookups waiting for the profile and match calls, and 196 ms after, with them running alongside (riot-proxy's profile and match calls were slower on the second day, 51 and 75 ms against 37 and 39 ms). A cold match page took 149–167 ms, and 118–131 ms after, with the stat shards fetched alongside the match. About 70 ms of the cold profile was parsing the lookups, which since SPD-09 load at start-up instead (ADR-048); against the mock proxy, the first profile after start-up made only its own two riot-proxy calls. On production after SPD-09 the first profile after a restart took 118 ms, with no static calls, against 48 ms warm; the rest is the page's first render (ADR-048).

**Local** (2026-10-20, 4-core development machine, Node 22.23.3, production build against the mock proxy, so riot-proxy time is near zero and this is the site's own cost):

| Page                             | p50, one at a time | p95     | p50 at 16 concurrent |
| -------------------------------- | ------------------ | ------- | -------------------- |
| `/summoner/NinjaGoldfinch-OCENZ` | 3.1 ms             | 4.3 ms  | 70 ms                |
| `/match/OC1_712351051`           | 10.8 ms            | 13.5 ms | 64 ms                |
| `/champions`                     | 4.0 ms             | 5.9 ms  | 66 ms                |
| `/champions/ahri`                | 3.7 ms             | 5.8 ms  | 65 ms                |

Throughput was 177 requests/s one at a time and 234 requests/s at 16 concurrent: one Node thread is the ceiling, and latency under concurrency is queueing. There are no benchmarks in the repository; these were taken with a small Python script for this document.

## In the browser

Images are the browser's main extra wait: every one comes straight from the Data Dragon CDN or CommunityDragon, not from the site ([architecture/decisions/0011-images-from-public-cdns.md](../architecture/decisions/0011-images-from-public-cdns.md)). Since SPD-10 the HTML helps the browser fetch them sooner:

- **Preconnect.** Every page has `<link rel="preconnect">` to Data Dragon (`src/routes/+layout.svelte:21-24`); the profile and match pages add one to CommunityDragon for their lane badges and stat shards. The champion page shows no CommunityDragon images, so it has none. The origins come from `DDRAGON_ORIGIN` and `CDRAGON_ORIGIN` in `src/lib/assets.ts:12-19`; preconnect adds no host the page did not already load images from.
- **The main image first.** The champion page's header icon is `ChampionIcon` with `priority` (`loading="eager"`, `fetchpriority="high"`); the profile icon was already eager and now also has `fetchpriority="high"`. Other images stay `loading="lazy"`.
- **No layout shift, no decode stall.** Every `<img>` keeps its `width` and `height` and has `decoding="async"`.

`tests/e2e/images.test.ts` checks all three with JavaScript off. SvelteKit's `data-sveltekit-preload-code="viewport"`, also in the plan, was not adopted.

**SPD-10, measured locally** (2026-11-03; Playwright against the production build and the mock proxy, image hosts answered locally after 30 ms, 1280×800, median of 7 loads):

| What                                                           | Before (`main`) | With SPD-10 |
| -------------------------------------------------------------- | --------------- | ----------- |
| Champion page header icon requested, after the HTML arrived    | 46.6 ms         | 5.6 ms      |
| Profile icon requested, after the HTML arrived (already eager) | 4.3 ms          | 4.4 ms      |
| Cumulative layout shift, champion page / profile               | 0.064 / 0.039   | unchanged   |

Preconnect's gain is a saved DNS, TCP and TLS handshake to each host, which a local run cannot show; it was not measured on production.

## Tuning knobs

None of these is a setting; each is a constant in code, changed by a commit with its test.

| Constant                            | Value                                                                                       | Effect                                                                                        | Source                                                                                     |
| ----------------------------------- | ------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| `proxyBudget`                       | 5 s analytics and static, 30 s otherwise                                                    | Longest wait on a riot-proxy call before a 503                                                | `src/lib/server/proxy.ts:69-78`                                                            |
| `PATCH_TTL_MS`                      | 5 min                                                                                       | Age after which the held patch is refreshed in the background                                 | `src/lib/server/patch.ts:62-63`                                                            |
| `SLOW_ANALYTICS_MS`                 | 250 ms                                                                                      | Threshold for the `proxy slow` log line                                                       | `src/lib/server/proxy.ts:37-38`                                                            |
| `SLOW_LOAD_MS`                      | 100 ms                                                                                      | Threshold for the `slow load` log line                                                        | `src/lib/server/timing.ts:10-11`                                                           |
| `CDRAGON_BUDGET_MS`                 | 5 s                                                                                         | Longest wait on CommunityDragon's `perks.json` before a match page leaves out the stat shards | `src/lib/server/cdragon.ts:12-13`                                                          |
| `CACHE_POLICIES`                    | profile 60 s (+300 s stale), match 1 day (+1 day), analytics 600 s (+600 s), not-found 60 s | How long Cloudflare may serve a page without asking the host                                  | `src/lib/server/cache.ts:5-18`                                                             |
| `MATCHES_PER_PAGE`                  | 10                                                                                          | Matches per profile page, so match-list size                                                  | `src/lib/domain/match-filters.ts:7`                                                        |
| adapter-node settings               | `KEEP_ALIVE_TIMEOUT`, `HEADERS_TIMEOUT`, `BODY_SIZE_LIMIT`                                  | Node HTTP server behaviour; none set                                                          | [deployment/configuration.md](../deployment/configuration.md#server-settings-adapter-node) |
| `NODE_OPTIONS=--max-old-space-size` | unset (Node's default)                                                                      | Bounds the V8 heap; not set in production                                                     | [deployment/capacity.md](../deployment/capacity.md#memory)                                 |

The biggest lever is the edge cache: a longer `s-maxage` means fewer renders and fewer riot-proxy calls, at the cost of staler pages. Profile pages are kept short because Refresh and new games should show quickly; match pages are long because a finished match never changes (`src/lib/server/cache.ts:6-11`). A page with an optional part missing is sent `no-store`, so while that part fails every view of it is rendered again and calls riot-proxy, as an error page does (ADR-045).

## What was decided against

- **Streaming optional parts of champion pages** (SPD-03, SPD-04): measured savings were at most about 110 ms once per champion per rebuild, and streamed content would not appear without JavaScript (ADR-039).
- **Caching analytics in the site:** riot-proxy caches them per aggregate generation; cold slices are riot-proxy's to warm (ADR-039).
- **Retries in the site:** riot-proxy retries Riot itself; the site fails fast within its budget (ADR-040).

## Expectations on the shared host

- The site uses at most about one of six vCPUs and stays in the tens of milliseconds per uncached page when riot-proxy is warm.
- Latency spikes come from riot-proxy: cold analytics slices (about 200 ms), uncached profiles waiting on Riot (seconds, up to the 30 s budget), or riot-proxy's background jobs competing for CPU and SQLite.
- `proxy slow … x-cache=MISS` lines in the journal mark cold slices; many of them after an analytics rebuild are expected (ADR-039). A `slow load` line for the same page names the call it waited on (ADR-046).
- A sustained rise in uncached traffic shows first as `QUOTA_EXCEEDED` or `RATE_LIMITED` (429 pages), not as CPU load ([deployment/capacity.md](../deployment/capacity.md#the-real-throughput-limit-riot-proxy-and-the-riot-key)).

---

**Sources:** `src/lib/server/profile.ts:L76-L114`, `src/lib/server/match.ts:L42-L61`, `src/lib/server/champions.ts:L37-L48`, `src/lib/server/champion-page.ts:L86-L148`, `src/lib/server/patch.ts:L51-L146`, `src/lib/server/cdragon.ts:L12-L13`, `src/lib/server/static-data.ts:L22-L51`, `src/lib/server/proxy.ts:L37-L78`, `src/hooks.server.ts:L11-L21`, `src/lib/server/timing.ts:L10-L95`, `src/lib/server/cache.ts:L5-L16`, `src/lib/domain/match-filters.ts:L7`, `src/lib/assets.ts:L12-L19`, `src/routes/+layout.svelte:L21-L24`, `src/lib/components/ChampionIcon.svelte:L1-L24`, `tests/e2e/images.test.ts`, `docs/DECISIONS.md:L159-L170,L517-L565,L632-L715`; local measurements 2026-10-20 and 2026-11-03 (SPD-10)
**Last verified:** 2026-11-03 against commit `a6b406b`
