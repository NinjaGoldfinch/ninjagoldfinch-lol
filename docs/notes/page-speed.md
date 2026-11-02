# Page speed: proposed changes

Approved by the owner on 2026-10-20. It continues the SPD series (SPD-01 to SPD-06, ADR-039 to ADR-041), so the new ids start at SPD-07. One task, one branch from `origin/main`, one PR, in the order below.

## Owner's answers

|                           | Answer                                                                                                                                                                       |
| ------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| SPD-07 output             | Server logs only: one line per load over a threshold. No `Server-Timing` header, so nothing reaches the browser and the edge never replays a stale timing.                   |
| SPD-09 during a new patch | Serve the old patch's lookups at once while the new patch's load in the background. Pages switch to the new patch when its lookups are ready.                                |
| SPD-11 champion names     | Stay in the page. No separate request; SPD-11 only removes the duplicate and trims what the page doesn't use.                                                                |
| Non-goals                 | None beyond "Already decided". A profile's Riot-bound wait stays riot-proxy's; request 2 below is for the owner to raise, after SPD-07 shows whether the match list matters. |

## Where the time goes

- **Server.** A page waits on riot-proxy. Analytics and static data answer in about 1 ms when warm (ADR-039). Profile and match routes can wait on Riot for seconds. The site adds 8–15 ms on a warm champion page.
- **Edge.** Cloudflare caches HTML (Cache Everything, with the query string in the key), using the site's `Cache-Control` from `src/lib/server/cache.ts`. A `HIT` takes 25–30 ms (ADR-039).
- **Browser.** Small: `build/client` is about 680 KB in all, the largest JS chunk 46 KB, CSS 27 KB. Every image comes from Data Dragon or CommunityDragon, which are third-party origins.

So the wins are, in order: serve more from the edge, start cold-path server calls sooner, keep the in-memory static data from going cold, and fetch images sooner.

## Already decided: don't reopen

- **No streaming** of optional parts (ADR-039). Without JavaScript a streamed card never fills in.
- **No site-side cache of player data or analytics.** ADR-013 and ADR-041 hold only data that can't change within a patch. Warming cold analytics slices is riot-proxy's job.
- **Calls stay in parallel**, and optional calls degrade on their own (ADR-040).

## Proposed tasks

### SPD-06 (existing): Cloudflare's cache of `__data.json`

Already in the list. Client-side navigation fetches `__data.json`, not the HTML. Check from outside that each page type's `__data.json` goes `MISS` then `HIT`, with the same `Cache-Control` as its HTML. Do it first: if these aren't cached, every in-site click goes to the origin, and that outweighs everything below.

Also confirm that profile and match pages get `HIT`s; ADR-039 measured only champion pages.

- **Acceptance:** `curl -sI` twice for `/champions/__data.json`, `/champions/ahri/__data.json`, a profile's and a match's `__data.json`: second response `cf-cache-status: HIT`. Results recorded in `docs/PROGRESS.md`.
- **Tests:** none (an external check); record the commands and output.

### SPD-07: Timing for each load

Measure before changing anything else. Each page load records the time spent in each riot-proxy call and in the load as a whole.

- **Where:** the middleware in `src/lib/server/proxy.ts`, which already times analytics calls (`logSlowAnalytics`), and the `handle` hook.
- **Output (owner):** one server log line per load slower than `SLOW_LOAD_MS` (100 ms; a warm champion page takes 8–15 ms, a cold one about 200 ms), like the slow-analytics line. It names the page by its SvelteKit route id (`/summoner/[riotId]`, not the URL) and each riot-proxy call by its spec path template (openapi-fetch's `schemaPath`) with its time, plus the load's total. No player name, no `X-Cache` (the slow-analytics line keeps that). Nothing reaches the browser: no `Server-Timing` header.
- **Warm timings** fall under the threshold, so they are measured on the VM with `curl -w` against the site's own port, as ADR-039 did.
- **Acceptance:** for each page type (profile, match, champions, champion, search), the cold and warm timings are recorded in the ADR.
- **Tests:** unit tests: a load over the threshold logs one line with the route id, each call's template and time, and the total; a load under it logs nothing; the line carries no concrete path (no player name) and no `X-Cache`; calls from concurrent loads are not mixed.

### SPD-08: Start cold-path calls sooner

Calls that don't depend on each other start together. These only help when the in-memory lookups are cold: after start-up, after a new patch, or after ADR-041's 5 minutes. That is also when loads are slowest (ADR-013: 831 ms for the first profile after start-up, 56 ms after).

| Load                       | Now                                                                   | Proposed                                                                                                            |
| -------------------------- | --------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| Profile (`profile.ts`)     | profile → (match page ‖ `currentPatch`) → `staticNames`               | (profile → match page) ‖ (`currentPatch` → `staticNames`). The profile → match page step stays: it needs the puuid. |
| Match (`match.ts`)         | (match ‖ timeline ‖ `patchVersions`) → (`staticNames` ‖ `statShards`) | match ‖ timeline ‖ (`patchVersions` → (`staticNames` ‖ `statShards`))                                               |
| Champions (`champions.ts`) | (table ‖ patches ‖ `currentPatch`) → `staticNames`                    | table ‖ patches ‖ (`currentPatch` → `staticNames`)                                                                  |

The failure behaviour stays as it is: `staticNames` and `statShards` still fall back to `NO_NAMES` and `{}`; the profile and match calls are still the essential ones.

- **Acceptance:** the same pages as today, from the same mock proxy responses. With SPD-07, a cold profile and a cold match page take about the slower branch, not the sum.
- **Tests:** unit tests with a fake client that records call start order and delays: the static lookups start before the profile (or match) call resolves. Existing fallback tests still pass.

### SPD-09: Warm static data at start-up; refresh the patch in the background

1. **At start-up**, fetch `patchVersions`, then `staticNames` and `statShards` for the current patch, so the first visitor after a deploy doesn't wait for `item.json` (~700 kB) and the rest. A failure is logged and not fatal; the first page tries again as now.
2. **After `PATCH_TTL_MS`**, keep serving the held versions and refresh in the background, instead of making the next request wait. A failed refresh keeps the old value and tries again on the next request. When the refresh finds a new patch, start loading its `staticNames` and `statShards` before pages ask for them.

- **Where:** `src/lib/server/patch.ts`, `static-data.ts`, `cdragon.ts`; start-up through the server `init` hook in `src/hooks.server.ts`.
- **Decision needed:** a new ADR extending ADR-013 and ADR-041. It covers data that can't change within a patch, never player data or analytics.
- **During a new patch (owner):** pages keep the old patch, its version for image URLs and its lookups, until the new patch's `staticNames` and `statShards` have loaded; then the patch and its lookups switch together, so a page never mixes two patches. If the new lookups fail, the old patch stays and the next refresh tries again. Only a cold start, with no patch held at all, waits as now.
- **Acceptance:** after a restart, the first profile view takes about what a warm one does. No request waits on `/v1/static/versions` or on a new patch's lookups once a patch is held.
- **Tests:** unit tests with fake timers: a stale value is returned at once and one refresh is sent; a failed refresh keeps the old value; concurrent callers share one refresh; a new patch triggers the lookups and is served only once they have loaded; failed new lookups keep the old patch. Start-up warming that fails doesn't throw.

### SPD-10: Fetch images sooner

1. **Preconnect.** In `src/routes/+layout.svelte`, add `<link rel="preconnect" href="https://ddragon.leagueoflegends.com">`. Add one for `https://raw.communitydragon.org` on match and champion pages, which use its icons. Build the origins in `src/lib/assets.ts`, the one place asset URLs live.
2. **Above-the-fold images load eagerly.** `ChampionIcon` is always `loading="lazy"`, including the large icon in a champion page's header, which delays the page's main image. Add a prop for `loading="eager"` with `fetchpriority="high"`, used by the champion page header and by the profile icon in `ProfileHeader.svelte`.
3. **Consistency.** `decoding="async"` on `ItemIcon` and the other `<img>`s, as `ChampionIcon` has. Every `<img>` keeps its `width` and `height`.
4. **Optional:** `data-sveltekit-preload-code="viewport"` on `<body>` in `src/app.html`, alongside the existing `data-sveltekit-preload-data="hover"`.

- **Acceptance:** Lighthouse (or Playwright's performance timings) against the mock proxy shows the LCP image starting earlier on a champion page and a profile; no layout shift added.
- **Tests:** unit tests for the preconnect origins in `assets.ts`; a Playwright check that the champion header icon and profile icon aren't `loading="lazy"` and that the preconnect links are in the head.

### SPD-11: Smaller page data

Everything a load returns is embedded in the HTML and sent again as `__data.json`.

1. **Champion names, sent twice.** Every page with Data Dragon names carries `championNames` (about 170 strings) for the header search. The profile also sends `championOptions`, the same champions with ids, for its filter. Derive `championNames` from `championOptions` in the profile page rather than sending both. The names stay in the page (owner): no separate request for them.
2. **Matchups.** The champion page asks for up to 200 matchups (`analyticsQuery(filter, 200)` in `champion-page.ts`). Check how many the page and the _vs_ picker actually use, and return only those.
3. **Measure first.** Record the HTML and `__data.json` size of each page type against the mock proxy, before and after.

- **Acceptance:** the measured sizes are smaller, and pages render the same.
- **Tests:** unit tests for any changed load output (fewer fields, trimmed lists); existing e2e tests pass.

## Requests for riot-proxy

None of the site tasks above needs a riot-proxy change. These would be riot-proxy's own tasks, checked against its v2.7.0 spec and `docs/DECISIONS.md` (ADR-169).

### 1. Warm the champion pages after a rebuild (most useful)

ADR-169's warm covers the champions table and the patch list only: "Champion pages aren't warmed; they fill on first view." A champion's first view after each rebuild costs the site about 200 ms (ADR-039), and ADR-039 already says warming them is riot-proxy's job.

- **Ask:** after each rebuild, also warm each champion's four default-view calls, with exactly the queries the site sends for a champion page with no filters: detail (`limit=10`), builds, matchups (`limit=200`) and `patches?queue&championId`. Take the queries from the site's recorded mock paths so the cache keys match.
- **Cost:** about 171 champions × 4 calls = 684 entries, which is more than `ANALYTICS_CACHE_ENTRIES`' default of 512. Raise the cap (ADR-169 puts 4096 at about 170 MB at most, and these bodies are smaller than the table's), or warm only the most-played champions.
- **Also from ADR-039:** a cold champion page took about the sum of its four reads (192 ms), not the slowest (87 ms). Either riot-proxy computes them one after another or they compete for CPU. Worth explaining, even if the warm makes it rarer.

### 2. The first page of matches with the profile (worth discussing)

A profile takes two calls in sequence: `/v1/players/by-riot-id/{gameName}/{tagLine}/profile`, then `/v1/players/{puuid}/matches` with the puuid it returned. Each can wait on Riot. If the profile route could also return the first match page (the same `start`, `count`, `queue` and `champion` parameters as `/matches`), riot-proxy could fetch the match list from Riot while it fetches the summoner and league, instead of after.

- **Gain:** on a cold profile, up to the Riot time of the match list. The site's own round trip to riot-proxy is small; the gain is overlapping the Riot calls.
- **Before asking:** measure with SPD-07 how long a cold profile spends in each call. If the match list is short next to the profile call, this isn't worth a new route shape.
- **Site side:** `profile.ts` would make one call instead of two, with the match page still optional (`matchesError` when that part fails). The spec has to say how a failed match part is reported in the profile body.

### 3. Smaller static lookups (low priority)

`staticNames` downloads Data Dragon's full `champion`, `item`, `summoner` and `runesReforged` files (`item.json` alone is about 700 kB) and keeps only names, ids and the item catalog. A reduced route would make the cold load lighter. SPD-09 already keeps that load off the request path, so ask for this only if start-up or patch-change time turns out to matter.

### Not for riot-proxy

- **Images.** riot-proxy has `/ddragon/{version}/img/...` routes, but the site loads images from Riot's CDN (ADR-009). Moving to them would put image traffic on the VPS for no clear speed gain. Leave it.
- **Server-Timing, preconnect, payload size:** site-only.

## Suggested order

1. SPD-06: the edge cache, the biggest effect.
2. SPD-07: timings, so the rest can be measured.
3. SPD-08 and SPD-09: the cold-path server work.
4. SPD-10: browser.
5. SPD-11: only if SPD-07's measurements show the size matters.

Each is one branch and one PR (`perf/SPD-nn-slug`), with tests and `just check`.

## Questions for the owner

Answered on 2026-10-20; see "Owner's answers" at the top.
