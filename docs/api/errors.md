# Errors

The error states a visitor can see on ninjagoldfinch.lol, what causes each, how riot-proxy's error codes map onto them, and what a visitor or operator should do.

## The three states

The site shows one of three states for any failure, and never passes riot-proxy's own messages through (`src/lib/server/errors.ts:6-14`, ADR-007).

| Status | Title                   | Text shown                                                    | Cache-Control         |
| ------ | ----------------------- | ------------------------------------------------------------- | --------------------- |
| 404    | Not found               | "Nothing matches that. Check the spelling and the #TAG."      | `public, s-maxage=60` |
| 429    | Too many requests       | "Riot's API is busy. Try again in N seconds." (or "a minute") | `no-store`            |
| 503    | Temporarily unavailable | "Player data cannot be loaded right now. Try again shortly."  | `no-store`            |

Texts from `src/lib/domain/error-view.ts:7-24`; the wait is formatted as seconds under a minute, then whole minutes (`:26-31`). Cache policies from `src/lib/server/cache.ts:31-36`, applied by the `handle` hook to every response, whatever the load set. The 404 is cached briefly so repeated misses do not all reach riot-proxy.

The page is `src/routes/+error.svelte:6-15`: a heading, the text and a "Back to search" link. Any other status SvelteKit produces (for example 403 or 415 on a bad form post) is described with the 503 text, because `describeError` treats every status other than 404 and 429 alike.

## Where errors come from

### riot-proxy error responses

`classifyProxyError` reads the code from riot-proxy's envelope, `{"error": {"code", "message", "requestId"?, "retryAfter"?}}`, and falls back on the HTTP status (`src/lib/server/errors.ts:16-33`):

| riot-proxy code  | riot-proxy HTTP                  | Site | Typical cause                                                                                 |
| ---------------- | -------------------------------- | ---- | --------------------------------------------------------------------------------------------- |
| `NOT_FOUND`      | 404                              | 404  | No such Riot ID or match                                                                      |
| `VALIDATION`     | 400                              | 404  | Input that cannot name anything, such as a malformed Riot ID                                  |
| `QUOTA_EXCEEDED` | 429                              | 429  | The site's consumer key spent its per-minute quota                                            |
| `RATE_LIMITED`   | 503                              | 429  | riot-proxy could not get a Riot rate-limit slot in time                                       |
| `BAD_REGION`     | 400                              | 503  | A match id that does not belong to the region (the site checks first, so this suggests a bug) |
| `UNAUTHORIZED`   | 401                              | 503  | `PROXY_KEY` missing, wrong or revoked                                                         |
| `FORBIDDEN`      | 403                              | 503  | The key lacks the `read` scope                                                                |
| `UPSTREAM_ERROR` | 502                              | 503  | Riot failed, or rejected riot-proxy's Riot key                                                |
| `INTERNAL`       | 500                              | 503  | A riot-proxy bug                                                                              |
| any other / none | 404 → 404, 429 → 429, else → 503 |      |                                                                                               |

riot-proxy's statuses: `riot-proxy:src/http/error.rs:13-25,55-67`. The retry time is the body's `retryAfter`, else the `Retry-After` header, else unknown (`src/lib/server/errors.ts:76-84`).

### The site's own checks

| Cause                                                                                                                                  | Status | Source                                                                                                                                                                                   |
| -------------------------------------------------------------------------------------------------------------------------------------- | ------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Riot ID in the URL that does not split into name and tag                                                                               | 404    | `src/routes/summoner/[riotId]/+page.server.ts:8-12`                                                                                                                                      |
| Match id whose prefix names no known platform                                                                                          | 404    | `src/routes/match/[matchId]/+page.server.ts:10-11`                                                                                                                                       |
| Match id that does not belong to its region                                                                                            | 404    | `src/lib/server/match.ts:39`                                                                                                                                                             |
| Custom game (queue 0 or none)                                                                                                          | 404    | `src/lib/server/match.ts:69`                                                                                                                                                             |
| Unknown champion key                                                                                                                   | 404    | `src/lib/server/champion-page.ts:98-99`                                                                                                                                                  |
| Old URL with an unknown region slug                                                                                                    | 404    | `src/routes/summoner/[region]/[riotId]/+server.ts:11`, `src/routes/match/[region]/[matchId]/+server.ts:9`                                                                                |
| riot-proxy names a platform the site has no region for                                                                                 | 503    | `src/lib/server/profile.ts:91-95`                                                                                                                                                        |
| Unparseable match payload                                                                                                              | 503    | `src/lib/server/match.ts:64-68`                                                                                                                                                          |
| No usable current patch from `/v1/static/versions`                                                                                     | 503    | `src/lib/server/patch.ts:165-169`                                                                                                                                                        |
| Data Dragon names unavailable on a champion page (a 429 stays a 429)                                                                   | 503    | `src/lib/server/champion-page.ts:92-97`                                                                                                                                                  |
| A riot-proxy call past its deadline (5 s or 30 s), or riot-proxy unreachable (connection refused, DNS failure, a body that breaks off) | 503    | `src/lib/server/proxy.ts:125-129`                                                                                                                                                        |
| Any unexpected exception (a bug)                                                                                                       | 500    | `src/hooks.server.ts:34-39`: the message becomes "Temporarily unavailable", but the status stays SvelteKit's 500 for an unknown error. Before RV-03 a refused connection also ended here |

## Partial failures

Optional calls do not produce an error page; they degrade one section (`src/lib/server/errors.ts:41-58`). On the profile, the current patch and its lookups start before the profile call; if the profile fails, its error is the page's, and the lookups' failure is ignored rather than left as an unhandled rejection (`early()`, `src/lib/server/errors.ts:60-68`):

| Page                | Section that degrades        | What the visitor sees                                               | Cache      |
| ------------------- | ---------------------------- | ------------------------------------------------------------------- | ---------- |
| profile             | match history                | "Match history: Too many requests" (or another state) with its text | `no-store` |
| profile             | Data Dragon names            | Fallback names, `Item 1234`, `Queue 1234`                           | normal     |
| match, `/champions` | Data Dragon names            | Fallback names, `Item 1234`, `Queue 1234`                           | `no-store` |
| match               | timeline                     | No item or skill order; the Timeline tab says it is unavailable     | `no-store` |
| match               | CommunityDragon stat shards  | Rune page without shards                                            | `no-store` |
| `/champions`        | patch list                   | Picker offers only the default and the shown patch                  | `no-store` |
| champion page       | builds, matchups, patch list | That card says it is unavailable                                    | `no-store` |

Sources: `src/routes/summoner/[riotId]/+page.svelte:24-26,87-88`, `src/lib/server/profile.ts:78-83,116-127`, `src/lib/server/match.ts:44-56,71-76`, `src/routes/match/[matchId]/+page.server.ts:17-19`, `src/lib/server/champions.ts:44-53`, `src/routes/champions/+page.server.ts:17-18`, `src/lib/server/champion-page.ts:142-149,173`, `src/routes/champions/[key]/+page.server.ts:29-30` (ADR-045).

## What to do

**Visitors.** 404: check the spelling and the `#TAG`. 429: wait the time shown and reload. 503: try again shortly.

**Operators.** Every riot-proxy failure is logged as `proxy <status> <METHOD> <path> request-id=<id>`; search riot-proxy's logs for that id. A run of 503s with `proxy 401` means the key; 503s with `proxy unreachable … ECONNREFUSED` mean riot-proxy is down; 503s with `proxy timeout … after <ms> ms` mean its calls are timing out. See [../integration/monitoring-hooks.md](../integration/monitoring-hooks.md).

---

**Sources:** `src/lib/server/errors.ts:L6-L84`, `src/lib/domain/error-view.ts:L7-L31`, `src/routes/+error.svelte:L6-L15`, `src/lib/server/cache.ts:L29-L34`, `src/hooks.server.ts:L34-L39`, `src/lib/server/proxy.ts:L95-L135`, `src/lib/server/profile.ts:L78-L127`, `src/lib/server/match.ts:L39-L76`, `src/lib/server/patch.ts:L165-L169`, `src/lib/server/champions.ts:L44-L53`, `src/lib/server/champion-page.ts:L92-L149`, `src/routes/summoner/[riotId]/+page.server.ts:L8-L12`, `src/routes/summoner/[riotId]/+page.svelte:L24-L88`, `src/routes/match/[matchId]/+page.server.ts:L10-L19`, `src/routes/champions/+page.server.ts:L17-L18`, `src/routes/champions/[key]/+page.server.ts:L29-L30`, `src/lib/server/champion-page.ts:L173`, `src/routes/summoner/[region]/[riotId]/+server.ts:L11`, `src/routes/match/[region]/[matchId]/+server.ts:L9`, `riot-proxy:src/http/error.rs:L13-L67`
**Last verified:** 2026-11-03 against commit `ea998cb`
