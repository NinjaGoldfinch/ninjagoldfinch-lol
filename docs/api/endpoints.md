# Endpoints

Every route ninjagoldfinch.lol serves, grouped by resource: what it does, its parameters, responses, cache policy and the riot-proxy calls behind it. The machine-readable version is [openapi.yaml](./openapi.yaml).

No route needs authentication. Responses are HTML unless stated. Every page also answers at `<path>/__data.json` with the same load, which SvelteKit uses for client-side navigation. It carries the page's `Cache-Control` once the load has called `setHeaders`; otherwise SvelteKit's `private, no-store`, which is what a redirect or an error in the load gets (both come back as a 200 with a redirect or error node). Header values below were observed by running `node build` against the mock proxy on 2026-10-19, and for redirects and `__data.json` again on 2026-11-03. Every response that passes through `handle`, pages, redirects, errors and `/healthz` alike, also carries the security headers, and every page a `Content-Security-Policy` ([../deployment/security.md](../deployment/security.md#response-headers), ADR-055).

Error responses are the same for every page and are described in [errors.md](./errors.md): 404 `public, s-maxage=60`; 429 and 503 `no-store`. Every redirect is `no-store`: the `handle` hook gives `no-store` to any response no load set a policy for (`src/hooks.server.ts:24-29`, ADR-045).

## Health

### `GET /healthz`

Liveness. Answers while the server runs; never calls riot-proxy. `version` is the running release, `package.json`'s version at build time; a deploy waits for it to match the tag it activated (ADR-051).

- Handler: `src/routes/healthz/+server.ts:7-9`, `src/lib/server/version.ts:5`
- Response: `200`, `application/json`, `{"ok":true,"version":"<package.json version>"}`, `Cache-Control: no-store`

```text
$ curl -i http://127.0.0.1:3000/healthz
HTTP/1.1 200 OK
cache-control: no-store
content-type: application/json

{"ok":true,"version":"0.0.1"}
```

## Static pages

| Route             | Handler                            | Notes                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| ----------------- | ---------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /`           | `src/routes/+page.server.ts`       | Search-first front page: `Patch X.Y` and games-analysed pills, a large search with example links, recent searches from `localStorage`, the six highest win rates over 800 games, and the free rotation and server status for `?region=` (a slug from `REGIONS`; Oceania when absent, 307 to the canonical URL for anything else). Calls `GET /v1/lol/analytics/champions`, `GET /v1/lol/rotations/{platform}` and `GET /v1/lol/status/{platform}` (each optional, 2 s front-page deadline) besides the held patch and lookups; the last two are Riot's payloads passed through, read by `parseRotation` and `parseStatus`. `live` policy: `public, s-maxage=60, stale-while-revalidate=120`; `no-store` with a card missing (ADR-066, ADR-071) |
| `GET /about`      | `src/routes/about/+page.server.ts` | `static` policy: `public, s-maxage=600, stale-while-revalidate=600`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| `GET /robots.txt` | `static/robots.txt`                | Static                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |

Every page's layout carries the header search form and Riot's legal notice (`src/routes/+layout.svelte`, `src/lib/legal.ts:3-4`).

## Search

### `GET /search`

The header search form submits here with `GET` (ADR-008, ADR-034).

- Handler: `src/routes/search/+page.server.ts:18-47`
- Cache: `no-store` (`:19`)

| Parameter | In    | Meaning                                        |
| --------- | ----- | ---------------------------------------------- |
| `q`       | query | A Riot ID (`Name#TAG`) or a champion name      |
| `riotId`  | query | Old name of the field; read when `q` is absent |

| Input                             | Result                                                                                    | riot-proxy calls                                     |
| --------------------------------- | ----------------------------------------------------------------------------------------- | ---------------------------------------------------- |
| empty                             | `200` empty form                                                                          | none                                                 |
| contains `#` and parses           | `303` to `/summoner/{riotId}`                                                             | none                                                 |
| contains `#` but does not parse   | `200` with "A Riot ID is Game name#TAG: up to 16 characters before the #, up to 5 after." | none                                                 |
| a champion name with one match    | `303` to `/champions/{key}#builds`                                                        | current patch and Data Dragon names (held in memory) |
| a name with several or no matches | `200` with a hint, such as "'sy' matches Sylas, Syndra. Keep typing."                     | same                                                 |
| names unavailable                 | `200` with "Champion search is unavailable right now. A Riot ID needs its #TAG."          | same                                                 |

```text
$ curl -sI 'http://127.0.0.1:3000/search?q=NinjaGoldfinch%23OCENZ'
HTTP/1.1 303 See Other
cache-control: no-store
location: /summoner/NinjaGoldfinch-OCENZ
```

## Profiles

### `GET /summoner/{riotId}`

A player's header (icon, level, Riot ID, "Updated N minutes ago", Refresh), ranks, ten matches and a champion summary.

- Handler: `src/routes/summoner/[riotId]/+page.server.ts:14-28`; loader `loadProfile`, `src/lib/server/profile.ts:71-155`
- `{riotId}`: `GameName-TAG`, URL-encoded, split on the last hyphen (`src/lib/domain/riot-id.ts:12-18`). Unparseable, a part of `.` or `..`, a game name over 16 characters or a tag over 5 → `404` (RV-02).

| Query      | Values                             | Default | Source                                    |
| ---------- | ---------------------------------- | ------- | ----------------------------------------- |
| `queue`    | 420, 440, 400, 490, 480, 450, 1700 | all     | `src/lib/domain/match-filters.ts:5,27-37` |
| `champion` | champion ID 1–10000                | all     | same                                      |
| `page`     | 1–1001, ten matches a page         | 1       | same                                      |

Anything not offered is ignored. If the query is not in canonical form (for example `?queue=&champion=` from the filter form) the response is `307` to the clean URL.

| Response | When                                                              | Cache-Control                                                                             |
| -------- | ----------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| `200`    | Profile loaded                                                    | `public, s-maxage=60, stale-while-revalidate=300`; `no-store` if the match history failed |
| `307`    | Non-canonical query                                               | `no-store`                                                                                |
| `404`    | Bad Riot ID, or riot-proxy `NOT_FOUND`/`VALIDATION`               | `public, s-maxage=60`                                                                     |
| `429`    | riot-proxy `QUOTA_EXCEEDED` or `RATE_LIMITED` on the profile call | `no-store`                                                                                |
| `503`    | Anything else, including an unknown platform and a timeout        | `no-store`                                                                                |

riot-proxy calls, two chains in parallel: `GET /v1/players/by-riot-id/{gameName}/{tagLine}/profile` (essential), then `GET /v1/players/{puuid}/matches?platform=…&count=10[&start][&queue][&champion]` (optional); and `GET /v1/static/versions`, then the Data Dragon files (optional), both normally already held from start-up and refreshed in the background (ADR-048). Custom games are left out (ADR-017).

```text
$ curl -sI http://127.0.0.1:3000/summoner/NinjaGoldfinch-OCENZ
HTTP/1.1 200 OK
cache-control: public, s-maxage=60, stale-while-revalidate=300
content-type: text/html
```

### `POST /summoner/{riotId}?/refresh`

The Refresh button: a form action (ADR-012).

- Handler: `src/routes/summoner/[riotId]/+page.server.ts:30-38`
- The filter may precede the action key: `?queue=420&/refresh` (`src/lib/domain/match-filters.ts:52-59`).
- Must be a form submission (`application/x-www-form-urlencoded` or `multipart/form-data`), else `415`; must come from the build-time `ORIGIN`, else `403`.
- Calls the same two riot-proxy routes with `refresh=true`. riot-proxy allows one refresh per player and part per 60 s and answers from cache inside that window.
- Response: the page with the fresh profile (`no-store`), or with JavaScript the action result as JSON.

### `GET /summoner/{region}/{riotId}`

Old profile URL. `308` to `/summoner/{riotId}`, keeping the query, with `no-store`; `404` if the region slug is not one of the 15 the site knows (`src/routes/summoner/[region]/[riotId]/+server.ts:9-13`, ADR-037).

## Matches

### `GET /match/{matchId}`

Both teams' scoreboards, each player's build (in a popup), and a Timeline tab with the gold difference and objectives.

- Handler: `src/routes/match/[matchId]/+page.server.ts:8-21`; loader `loadMatch`, `src/lib/server/match.ts:34-85`
- `{matchId}`: Riot's id, e.g. `OC1_712351051`. The prefix picks the region; an unknown prefix is `404` without calling riot-proxy (`src/lib/domain/regions.ts:46-50`). A lower-case id (`oc1_…`) is a `308` to the upper-case one, keeping the query, with `no-store` (RV-05).

| Query    | Meaning                                     | Read by                                                 |
| -------- | ------------------------------------------- | ------------------------------------------------------- |
| `player` | Riot ID to highlight, `GameName-TAG`        | the page (`src/routes/match/[matchId]/+page.svelte:33`) |
| `tab`    | `timeline`; anything else is the scoreboard | the page (`:51`)                                        |
| `build`  | Participant ID whose build to open          | the page (`:68`)                                        |

These do not change the server's data, but each URL is its own edge cache entry.

| Response     | When                                                       | Cache-Control                                                                                                                 |
| ------------ | ---------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `200`        | Match loaded                                               | `public, s-maxage=86400, stale-while-revalidate=86400`; `no-store` if the timeline, Data Dragon lookups or stat shards failed |
| `404`        | Unknown prefix, riot-proxy `NOT_FOUND`, or a custom game   | `public, s-maxage=60`                                                                                                         |
| `429`, `503` | As for profiles; also an unparseable match payload (`503`) | `no-store`                                                                                                                    |

riot-proxy calls, in parallel: `GET /v1/lol/matches/{region}/{matchId}` (essential), `GET …/timeline` (optional), and `GET /v1/static/versions` followed by Data Dragon names and CommunityDragon's `perks.json` once per patch (both optional).

```text
$ curl -sI http://127.0.0.1:3000/match/OC1_712351051
HTTP/1.1 200 OK
cache-control: public, s-maxage=86400, stale-while-revalidate=86400
content-type: text/html
```

### `GET /match/{region}/{matchId}`

Old match URL. `308` to `/match/{matchId}`, the id upper-cased, keeping the query, with `no-store`; `404` for an unknown region slug. The region in the old URL is otherwise ignored (`src/routes/match/[region]/[matchId]/+server.ts:8-11`).

## Champions

Both champion pages read Ranked Solo/Duo (`RANKED_SOLO_5x5`) over every region, send `minGames=0`, and mark rates from under 100 games "Low sample" (`src/lib/domain/champion-stats.ts:13-31`, ADR-033, ADR-035). Shared filters:

| Query   | Values                                                                  | Default    | Sent to riot-proxy as                         |
| ------- | ----------------------------------------------------------------------- | ---------- | --------------------------------------------- |
| `role`  | `top`, `jungle`, `mid`, `bot`, `support`                                | every role | `role=TOP`…`UTILITY`                          |
| `patch` | `all`, `newest`, or `major.minor` such as `16.19`                       | `all`      | `patch=all`, omitted for newest, or the patch |
| `rank`  | a tier (`diamond`) or a tier and above (`diamond+`), Iron to Challenger | every tier | `tier=DIAMOND` or `minTier=DIAMOND`           |

Sources: `src/lib/domain/champion-stats.ts:34-195`. Unknown values fall back to the default and the page redirects to the canonical URL.

### `GET /champions`

The champion table: win, pick and ban rate per champion.

- Handler: `src/routes/champions/+page.server.ts:7-20`; loader `loadChampions`, `src/lib/server/champions.ts:33-62`
- Extra query: `sort` = `pick` (default), `win` or `ban`. Read without re-running the load, so with JavaScript sorting needs no request.
- Responses: `200` with `public, s-maxage=600, stale-while-revalidate=600`, or `no-store` if the patch list or Data Dragon lookups failed; `307` to the canonical query; `429`/`503` as above.
- riot-proxy calls: `GET /v1/lol/analytics/champions?queue=RANKED_SOLO_5x5&patch=…[&role][&tier|&minTier]&minGames=0&limit=500` (essential), `GET /v1/lol/analytics/patches?queue=RANKED_SOLO_5x5` (optional), and the current patch followed by Data Dragon names (optional), all three in parallel.

```text
$ curl -sI 'http://127.0.0.1:3000/champions?patch=all'
HTTP/1.1 307 Temporary Redirect
cache-control: no-store
location: /champions
```

### `GET /champions/{key}`

One champion: header rates, set builds in tabs, lane matchups and rates by tier.

- Handler: `src/routes/champions/[key]/+page.server.ts:9-32`; loaders `findChampionPage` and `loadChampionPage`, `src/lib/server/champion-page.ts:82-175`
- `{key}`: Data Dragon's id lower-cased (`ahri`, `monkeyking`). Any spelling of the id or display name (`Ahri`, `wukong`) gets `308` to it, keeping the canonical query. No match → `404`.

| Extra query | Meaning                                                                                                                           | Source                                    |
| ----------- | --------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------- |
| `vs`        | Lane opponent for the set builds, as its key (`syndra`), in any case (`Syndra` redirects to `syndra`); unknown values are dropped | `src/lib/domain/champion-page.ts:212-240` |
| `lane`      | Lane against the opponent; ignored when `role` is set                                                                             | same                                      |
| `build`     | 1-based build tab, read by the page only                                                                                          | `src/lib/domain/champion-page.ts:302-305` |

- Responses: `200` analytics policy, or `no-store` if the set builds, matchups or patch list failed; `308` to the canonical name; `307` to the canonical query when only the query needs tidying (it can change with a default or a champion the lookups do not know yet); `404`; `429`/`503`. Without the Data Dragon names the key cannot be resolved: `503`.
- riot-proxy calls, in parallel: `GET /v1/lol/analytics/champions/{id}?…&limit=10` (essential), `…/{id}/builds?…[&opponentId]` (optional), `…/{id}/matchups?…&limit=200` (optional), `GET /v1/lol/analytics/patches?queue=RANKED_SOLO_5x5&championId={id}` (optional).

```text
$ curl -sI http://127.0.0.1:3000/champions/Ahri
HTTP/1.1 308 Permanent Redirect
cache-control: no-store
location: /champions/ahri

$ curl -sI 'http://127.0.0.1:3000/champions/ahri?rank=emerald%2B'
HTTP/1.1 307 Temporary Redirect
cache-control: no-store
location: /champions/ahri?rank=emerald+
```

## Unknown paths

Any other path is a SvelteKit `404` page with `Cache-Control: public, s-maxage=60` (set by `src/hooks.server.ts:20-32`).

---

**Sources:** `src/routes/healthz/+server.ts:L7-L9`, `src/routes/+page.ts:L3`, `src/routes/about/+page.ts:L2`, `src/routes/search/+page.server.ts:L14-L47`, `src/routes/summoner/[riotId]/+page.server.ts:L8-L38`, `src/routes/summoner/[region]/[riotId]/+server.ts:L9-L13`, `src/routes/match/[matchId]/+page.server.ts:L8-L21`, `src/routes/match/[matchId]/+page.svelte:L33-L69`, `src/routes/match/[region]/[matchId]/+server.ts:L8-L11`, `src/routes/champions/+page.server.ts:L7-L20`, `src/routes/champions/[key]/+page.server.ts:L9-L32`, `src/lib/server/profile.ts:L71-L155`, `src/lib/server/match.ts:L34-L85`, `src/lib/server/champions.ts:L33-L62`, `src/lib/server/champion-page.ts:L82-L186`, `src/lib/domain/match-filters.ts:L5-L59`, `src/lib/domain/riot-id.ts:L12-L18`, `src/lib/domain/regions.ts:L46-L50`, `src/lib/domain/champion-stats.ts:L13-L195`, `src/lib/domain/champion-page.ts:L212-L305`, `src/hooks.server.ts:L20-L32`, `src/lib/legal.ts:L3-L4`, `docs/DECISIONS.md:L617-L630`; probes of `node build` against the mock proxy, 2026-10-19 and 2026-11-03
**Last verified:** 2026-11-03 against commit `ea998cb`
