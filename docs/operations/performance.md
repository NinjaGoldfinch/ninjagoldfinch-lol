# Performance

Where ninjagoldfinch.lol spends time on a request, the numbers measured so far, the constants that act as tuning knobs, and what to expect on the shared `ngf-prod-syd1`. For memory, disk and bandwidth see [deployment/capacity.md](../deployment/capacity.md).

## Where the time goes

A page's time is almost all riot-proxy's: the site's own rendering is a few milliseconds, and the edge cache answers repeat views without reaching the host at all.

| Page                 | riot-proxy calls (in parallel where possible)                                                                                | Site work                                                            | Source                                                                  |
| -------------------- | ---------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| `/summoner/{riotId}` | profile, then match list (10 per page) and current patch together; Data Dragon lookups if not held                           | shaping rows                                                         | `src/lib/server/profile.ts:74-111`, `src/lib/domain/match-filters.ts:7` |
| `/match/{matchId}`   | match, timeline and current patch together; then Data Dragon lookups and CommunityDragon `perks.json` together, if not held  | parsing match and timeline, builds, gold chart (the heaviest render) | `src/lib/server/match.ts:40-76`                                         |
| `/champions`         | table, patch list and current patch together; Data Dragon lookups if not held                                                | summing tiers, sorting                                               | `src/lib/server/champions.ts:37-57`                                     |
| `/champions/{key}`   | current patch and Data Dragon lookups first (to resolve the champion), then detail, builds, matchups and patch list together | shaping cards                                                        | `src/lib/server/champion-page.ts:86-148`                                |

Shared lookups are held in memory so most requests skip them: the current patch for 5 minutes, and the Data Dragon names and CommunityDragon stat shards for the current patch until it changes. Concurrent requests share one in-flight fetch, and a failed fetch is not kept (`src/lib/server/patch.ts:48-66`, `src/lib/server/static-data.ts:22-37`, ADR-013, ADR-041).

The Data Dragon `item.json` alone is about 700 kB, which is why the reduced lookups are held rather than fetched per request (`src/lib/server/static-data.ts:22-24`).

## Measured numbers

**Production** (ADR-039, measured 2026-10-15 on the production server, `docs/DECISIONS.md:521-527`):

| What                                                                                   | Time                                 |
| -------------------------------------------------------------------------------------- | ------------------------------------ |
| riot-proxy: table, patch list, versions (warm)                                         | 0.7–1.4 ms                           |
| riot-proxy: one champion's detail / builds / matchups / patches, first after a rebuild | 87 / 76 / 23 / 6 ms, then under 1 ms |
| Site: `/champions`, `/champions/ahri` and their `__data.json`, riot-proxy warm         | 8–15 ms                              |
| Site: a champion page's first view after a rebuild                                     | about 200 ms                         |
| Through Cloudflare                                                                     | `MISS` 55–69 ms, `HIT` 25–30 ms      |

Before ADR-039's riot-proxy changes, production's `/champions/__data.json` took 3.9 s (`docs/DECISIONS.md:519`).

**Local** (2026-10-20, 4-core development machine, Node 22.23.3, production build against the mock proxy, so riot-proxy time is near zero and this is the site's own cost):

| Page                             | p50, one at a time | p95     | p50 at 16 concurrent |
| -------------------------------- | ------------------ | ------- | -------------------- |
| `/summoner/NinjaGoldfinch-OCENZ` | 3.1 ms             | 4.3 ms  | 70 ms                |
| `/match/OC1_712351051`           | 10.8 ms            | 13.5 ms | 64 ms                |
| `/champions`                     | 4.0 ms             | 5.9 ms  | 66 ms                |
| `/champions/ahri`                | 3.7 ms             | 5.8 ms  | 65 ms                |

Throughput was 177 requests/s one at a time and 234 requests/s at 16 concurrent: one Node thread is the ceiling, and latency under concurrency is queueing. There are no benchmarks in the repository; these were taken with a small Python script for this document.

## Tuning knobs

None of these is a setting; each is a constant in code, changed by a commit with its test.

| Constant                            | Value                                                                                       | Effect                                                                                        | Source                                                                                     |
| ----------------------------------- | ------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| `proxyBudget`                       | 5 s analytics and static, 30 s otherwise                                                    | Longest wait on a riot-proxy call before a 503                                                | `src/lib/server/proxy.ts:68-77`                                                            |
| `PATCH_TTL_MS`                      | 5 min                                                                                       | How long the current patch is held                                                            | `src/lib/server/patch.ts:45-46`                                                            |
| `SLOW_ANALYTICS_MS`                 | 250 ms                                                                                      | Threshold for the `proxy slow` log line                                                       | `src/lib/server/proxy.ts:36-37`                                                            |
| `CDRAGON_BUDGET_MS`                 | 5 s                                                                                         | Longest wait on CommunityDragon's `perks.json` before a match page leaves out the stat shards | `src/lib/server/cdragon.ts:11-12`                                                          |
| `CACHE_POLICIES`                    | profile 60 s (+300 s stale), match 1 day (+1 day), analytics 600 s (+600 s), not-found 60 s | How long Cloudflare may serve a page without asking the host                                  | `src/lib/server/cache.ts:5-16`                                                             |
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
- `proxy slow … x-cache=MISS` lines in the journal mark cold slices; many of them after an analytics rebuild are expected (ADR-039).
- A sustained rise in uncached traffic shows first as `QUOTA_EXCEEDED` or `RATE_LIMITED` (429 pages), not as CPU load ([deployment/capacity.md](../deployment/capacity.md#the-real-throughput-limit-riot-proxy-and-the-riot-key)).

---

**Sources:** `src/lib/server/profile.ts:L74-L111`, `src/lib/server/match.ts:L40-L76`, `src/lib/server/champions.ts:L37-L57`, `src/lib/server/champion-page.ts:L86-L148`, `src/lib/server/patch.ts:L45-L66`, `src/lib/server/cdragon.ts:L11-L12`, `src/lib/server/static-data.ts:L22-L37`, `src/lib/server/proxy.ts:L36-L77`, `src/lib/server/cache.ts:L5-L16`, `src/lib/domain/match-filters.ts:L7`, `docs/DECISIONS.md:L159-L170,L515-L563`; local measurements 2026-10-20
**Last verified:** 2026-11-03 against commit `03faa33`
