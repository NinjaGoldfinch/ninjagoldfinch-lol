# Contract with riot-proxy

What ninjagoldfinch.lol depends on from riot-proxy: the routes, parameters, response fields, headers and error codes it uses. This is the consumer's view; riot-proxy's OpenAPI document is canonical.

## Version and canonical source

| Item                   | Value                                                                                                                                   |
| ---------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| Canonical contract     | riot-proxy's OpenAPI document, served at `/openapi.json` and printed by `riot-proxy spec` (`README.md:52-54`)                           |
| Committed copy         | `openapi/riot-proxy.json`, `info.version` `2.7.0`, 70 paths                                                                             |
| sha256 of the copy     | `aafca9012b7c5bfe2db24f23d7397cd5a46987e4ba88809397ece91aa64088b8` (matches production's `/openapi.json` on 2026-10-19, `README.md:67`) |
| riot-proxy source read | `../riot-proxy` at `48f32aa`, `Cargo.toml` version `2.7.0`                                                                              |
| Generated types        | `src/lib/api/schema.d.ts` from `just gen`; `just check` fails on drift (`justfile:16-22`)                                               |

The site may use only what the spec declares (`CLAUDE.md:21-22`). To move to a new riot-proxy release, refresh the spec from the release binary and regenerate the types (`README.md:56-65`).

> **TODO (unverified):** a human-readable contract page on riot-proxy's side for this document to link to. riot-proxy's `docs/` has no consumer guide at `48f32aa` (`docs/contract/` holds the v1 contract, which is not the current spec). Link it here once riot-proxy's documentation set adds `docs/integration/contract.md`.

## Transport and authentication

- Base URL from `PROXY_URL`; production `http://127.0.0.1:8080`.
- `Authorization: Bearer <PROXY_KEY>` on every call when `PROXY_KEY` is set (`src/lib/server/proxy.ts:137-148`). The key needs the `read` scope (`riot-proxy:src/routes/docs.rs:118-126`). See [authentication.md](./authentication.md).
- All calls are `GET` with JSON responses. Deadlines: 5 s for `/v1/lol/analytics/*` and `/v1/static/*`, 30 s for the rest (`src/lib/server/proxy.ts:74-78`); the front page's cards have 2 s, through `frontClient` (ADR-066).

## Routes used

Fourteen of the spec's 70 paths. Required means a failure fails the page.

| Route                                                     | Used by              | Query the site sends                                                                                                              | Required |
| --------------------------------------------------------- | -------------------- | --------------------------------------------------------------------------------------------------------------------------------- | -------- |
| `GET /v1/players/by-riot-id/{gameName}/{tagLine}/profile` | profile              | `refresh=true` on Refresh only; no `platform`                                                                                     | yes      |
| `GET /v1/players/{puuid}/matches`                         | profile              | `platform`, `start` (page > 1), `count=10`, `queue`, `champion`, `refresh`                                                        | no       |
| `GET /v1/lol/matches/{region}/{matchId}`                  | match                | —                                                                                                                                 | yes      |
| `GET /v1/lol/matches/{region}/{matchId}/timeline`         | match                | —                                                                                                                                 | no       |
| `GET /v1/static/versions`                                 | every page with data | —                                                                                                                                 | yes      |
| `GET /v1/static/{file}`                                   | every page with data | `version`; `file` one of `champion`, `item`, `summoner`, `runesReforged`                                                          | no*      |
| `GET /v1/static/queues`                                   | every page with data | —                                                                                                                                 | no*      |
| `GET /v1/lol/analytics/champions`                         | `/champions`, `/`    | `queue=RANKED_SOLO_5x5`, `patch` (`/`: `all`, or left out for the newest), `role`, `tier` or `minTier`, `minGames=0`, `limit=500` | yes      |
| `GET /v1/lol/analytics/champions/{championId}`            | `/champions/{key}`   | as above with `limit=10`                                                                                                          | yes      |
| `GET /v1/lol/analytics/champions/{championId}/builds`     | `/champions/{key}`   | as above without `limit`, plus `opponentId` against an opponent                                                                   | no       |
| `GET /v1/lol/analytics/champions/{championId}/matchups`   | `/champions/{key}`   | as above with `limit=200`                                                                                                         | no       |
| `GET /v1/lol/analytics/patches`                           | champion pages       | `queue=RANKED_SOLO_5x5`, `championId` on a champion page                                                                          | no       |
| `GET /v1/lol/status/{platform}`                           | `/`                  | — (`platform` from `?region=`)                                                                                                    | no       |

\* The Data Dragon files fall back to plain names when unavailable, except on a champion page, which cannot resolve its URL without them (`src/lib/server/champion-page.ts:92-97`).

Sources: `src/lib/server/profile.ts:86-112`, `src/lib/server/match.ts:41-61`, `src/lib/server/patch.ts:162`, `src/lib/server/static-data.ts:54-63`, `src/lib/server/champions.ts:40-43`, `src/lib/server/champion-page.ts:121-139,182-186`, `src/lib/domain/champion-stats.ts:178-195`.

Parameter values come from site tables: `platform` from `REGIONS` (`src/lib/domain/regions.ts:15-31`), on the front page from `FRONT_REGIONS`, which leaves out the Middle East's `me1` until a riot-proxy release accepts it (ADR-072); `region` (regional route) from the match id's platform; `role` one of `TOP`, `JUNGLE`, `MIDDLE`, `BOTTOM`, `UTILITY`; `tier`/`minTier` one of Riot's ten tiers (`src/lib/domain/champion-stats.ts:34-63`); `queue` for matches one of 420, 440, 400, 490, 480, 450, 1700 (`src/lib/domain/match-filters.ts:5`); `start` at most 10000 and `champion` 1–10000 (`src/lib/domain/match-filters.ts:7-11`).

## Fields the site reads

The generated types cover every field; this is the subset the site's behaviour depends on.

| Route        | Fields                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | Code                                                                               |
| ------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| profile      | `platform`, `puuid`, `account.gameName`, `account.tagLine`, `summoner.profileIconId`, `summoner.summonerLevel`, `league[]` (`queueType`, `tier`, `rank`, `leaguePoints`, `wins`, `losses`), `fetchedAgeSeconds.summoner`, `fetchedAgeSeconds.league`, `refreshAvailableIn`, `warnings[]`                                                                                                                                                                                                                                                                                               | `src/lib/server/profile.ts:89-154`, `src/lib/api/riot.ts:11-35`                    |
| matches      | `matches[]` (`matchId`, `queueId`, `gameCreation`, `gameDuration`, `gameVersion`, `ddragonVersion`, `player.*` stats, items, spells, runes, `teamPosition`), `warnings[]`, `matchIdsFetchedAgeSeconds`, `refreshAvailableIn`, `hasMore`, `archive.complete`                                                                                                                                                                                                                                                                                                                            | `src/lib/server/profile.ts:117-152`, `src/lib/domain/matches.ts:49-85`             |
| match        | Riot match-v5 body, untyped in the spec; parsed by hand: `metadata.matchId`, `info.queueId`, `gameCreation`, `gameDuration`, `gameVersion`, `participants[]`, `teams[]`                                                                                                                                                                                                                                                                                                                                                                                                                | `src/lib/api/match.ts:159-212`                                                     |
| timeline     | Riot timeline body, untyped; `info.frames[]` gold, item, skill and objective events, `info.participants[]` puuids                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | `src/lib/api/match.ts:214-…`                                                       |
| versions     | `current`, else `versions[0]`; `versions[]`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | `src/lib/server/patch.ts:17-31`                                                    |
| static files | Data Dragon JSON as published; `queues` as Riot publishes them                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | `src/lib/api/ddragon.ts`                                                           |
| champions    | `patch`, `tier`, `totalGames` (participant games; the front page's pill shows a tenth of it, ADR-074), `champions[]` (`championId`, `championName`, `tier`, `games`, `winRate`, `pickRate`, `banRate`)                                                                                                                                                                                                                                                                                                                                                                                 | `src/lib/domain/champion-stats.ts:223-241`                                         |
| detail       | `patch`, `tier`, `stats[]`, `byTier[]`, `items`, `runes`, `spells`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | `src/lib/server/champion-page.ts:155-164`, `src/lib/domain/champion-page.ts:37-80` |
| builds       | `role`, `opponentId`, `totalGames`, `builds[]` (`core`, `next`, `boots`, `starter`, `skillOrder`, `runes`, `spells`, `games`, `winRate`, `pickRate`)                                                                                                                                                                                                                                                                                                                                                                                                                                   | `src/lib/domain/champion-page.ts:110-150`                                          |
| matchups     | `matchups[]` (`opponentId`, `opponentName`, `role`, `games`, `winRate`)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                | `src/lib/domain/champion-page.ts:183-215`                                          |
| status       | Riot's lol-status-v4 `PlatformDataDto`, untyped; parsed by hand: `name`, `incidents[]` and `maintenances[]` (both required), each entry's `id` (integer; without one, the entry is kept and keyed by its place), `titles[]` (`locale`, `content`; `en_US` preferred; without one, `Incident` or `Maintenance`, ADR-072), `incident_severity`, `maintenance_status` (`complete` dropped), `updated_at`, `created_at`, and of `updates[]` the newest published one's text (`translations[]` as `titles[]`; `publish`, `updated_at`, `created_at`; ADR-075); header `X-Cache-Fetched-Age` | `src/lib/domain/front-page.ts` (`parseStatus`, `statusView`, `fetchedAge`)         |
| patches      | `patches[].patch`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | `src/lib/domain/champion-stats.ts:243-245`                                         |

Semantics the site relies on:

- Without `tier`, analytics rows are summed over every tier with `tier: null`, and a summed row carries the body's own `tier` (`docs/DECISIONS.md:415,577`). The site keeps only rows whose `tier` equals the body's (`src/lib/domain/champion-stats.ts:223-230`).
- Without `role`, set builds name the champion's most-played role (`docs/DECISIONS.md:441`).
- `refreshAvailableIn` is seconds until another refresh is allowed (`riot-proxy:src/routes/players/refresh.rs:22-28`).
- A match id's platform prefix must match `region`, or riot-proxy answers `BAD_REGION`; the site checks first (`src/lib/server/match.ts:39`, `riot-proxy:src/routes/lol.rs:53-64`).
- The status route passes Riot's lol-status-v4 payload through with an empty schema; the shape above is what the site assumes of Riot's, and a payload that does not fit leaves its card out and is logged, not an error page (ADR-071). The site no longer reads the rotations route (ADR-076).
- `MatchSummary.gameVersion` is the game build (`16.20.824.8524`), not a Data Dragon version, despite the spec's wording; the site maps it by `major.minor` (`docs/DECISIONS.md:143`, `src/lib/domain/matches.ts:160-163`).

## Headers the site reads

| Header                | Use                                                               | Code                                                                          |
| --------------------- | ----------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| `X-Request-Id`        | Logged with every failed call                                     | `src/lib/server/proxy.ts:15`                                                  |
| `X-Cache`             | Logged with analytics calls over 250 ms                           | `src/lib/server/proxy.ts:59`                                                  |
| `Retry-After`         | Wait time for 429 pages when the body has no `retryAfter`         | `src/lib/server/errors.ts:76-84`                                              |
| `X-Cache-Fetched-Age` | The status card's "checked X ago", on `/v1/lol/status/{platform}` | `src/lib/server/front-page.ts`, `src/lib/domain/front-page.ts` (`fetchedAge`) |

`X-Cache-Age`, `X-RateLimit-*` and `ETag` are sent by riot-proxy but not read, nor `X-Cache-Fetched-Age` on other routes (ADR-007 explains why `X-RateLimit-*` is not used for the retry time, `docs/DECISIONS.md:87`).

## Errors

riot-proxy's envelope is `{"error": {"code", "message", "requestId"?, "retryAfter"?}}` (`riot-proxy:src/http/error.rs:140-172`). The site maps codes to three states and never shows the message (`src/lib/server/errors.ts:16-33`):

| riot-proxy code  | riot-proxy status | Site state                  |
| ---------------- | ----------------- | --------------------------- |
| `NOT_FOUND`      | 404               | 404 Not found               |
| `VALIDATION`     | 400               | 404 Not found               |
| `QUOTA_EXCEEDED` | 429               | 429 Too many requests       |
| `RATE_LIMITED`   | 503               | 429 Too many requests       |
| `BAD_REGION`     | 400               | 503 Temporarily unavailable |
| `UNAUTHORIZED`   | 401               | 503 Temporarily unavailable |
| `FORBIDDEN`      | 403               | 503 Temporarily unavailable |
| `UPSTREAM_ERROR` | 502               | 503 Temporarily unavailable |
| `INTERNAL`       | 500               | 503 Temporarily unavailable |

Statuses from `riot-proxy:src/http/error.rs:13-25,55-67`. Full detail in [../api/errors.md](../api/errors.md).

## What the site does not use

WebSockets (`/v1/ws`), admin routes, `riot` account routes, live game and mastery routes, `side` filters, `winRateLow` (VS-04 dropped), `/ddragon/…` images and `?token=` authentication (`docs/DECISIONS.md:225,540,597`; inventory section 5).

---

**Sources:** `openapi/riot-proxy.json` (version, path count, sha256), `src/lib/server/proxy.ts:L15-L154`, `src/lib/server/errors.ts:L16-L84`, `src/lib/server/profile.ts:L86-L154`, `src/lib/server/match.ts:L39-L61`, `src/lib/server/patch.ts:L17-L162`, `src/lib/server/static-data.ts:L54-L63`, `src/lib/server/champions.ts:L40-L43`, `src/lib/server/champion-page.ts:L91-L186`, `src/lib/server/front-page.ts:L67-L185`, `src/lib/domain/front-page.ts:L85-L97,L123-L375`, `src/lib/domain/champion-stats.ts:L34-L63,L178-L245`, `src/lib/domain/champion-page.ts:L37-L215`, `src/lib/domain/matches.ts:L49-L85,L160-L163`, `src/lib/domain/match-filters.ts:L5-L11`, `src/lib/domain/regions.ts:L15-L31`, `src/lib/api/match.ts:L159-L217`, `src/lib/api/riot.ts:L11-L35`, `README.md:L52-L67`, `justfile:L16-L22`, `CLAUDE.md:L21-L22`, `docs/DECISIONS.md:L87,L143,L225,L415,L441,L540,L577,L597`, `riot-proxy:src/http/error.rs:L13-L172`, `riot-proxy:src/routes/docs.rs:L118-L126`, `riot-proxy:src/routes/lol.rs:L53-L64`, `riot-proxy:src/routes/players/refresh.rs:L22-L28`
**Last verified:** 2026-11-03 against commit `e183749`; the platform values and the rotations and status rows on 2026-11-09 against `a193653`; `totalGames` in the champions row and the status row on 2026-11-10 against `91c83d3` with FIX-17's and FP-04's changes; the rotations rows removed on 2026-11-10 with FP-08's change
