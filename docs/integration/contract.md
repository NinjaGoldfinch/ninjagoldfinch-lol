# Contract with riot-proxy

What ninjagoldfinch.lol depends on from riot-proxy: the routes, parameters, response fields, headers and error codes it uses. This is the consumer's view; riot-proxy's OpenAPI document is canonical.

## Version and canonical source

| Item                   | Value                                                                                                                                   |
| ---------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| Canonical contract     | riot-proxy's OpenAPI document, served at `/openapi.json` and printed by `riot-proxy spec` (`README.md:51-53`)                           |
| Committed copy         | `openapi/riot-proxy.json`, `info.version` `2.7.0`, 70 paths                                                                             |
| sha256 of the copy     | `aafca9012b7c5bfe2db24f23d7397cd5a46987e4ba88809397ece91aa64088b8` (matches production's `/openapi.json` on 2026-10-19, `README.md:66`) |
| riot-proxy source read | `../riot-proxy` at `48f32aa`, `Cargo.toml` version `2.7.0`                                                                              |
| Generated types        | `src/lib/api/schema.d.ts` from `just gen`; `just check` fails on drift (`justfile:16-22`)                                               |

The site may use only what the spec declares (`CLAUDE.md:21-22`). To move to a new riot-proxy release, refresh the spec from the release binary and regenerate the types (`README.md:55-64`).

> **TODO (unverified):** a human-readable contract page on riot-proxy's side for this document to link to. riot-proxy's `docs/` has no consumer guide at `48f32aa` (`docs/contract/` holds the v1 contract, which is not the current spec). Link it here once riot-proxy's documentation set adds `docs/integration/contract.md`.

## Transport and authentication

- Base URL from `PROXY_URL`; production `http://127.0.0.1:8080`.
- `Authorization: Bearer <PROXY_KEY>` on every call when `PROXY_KEY` is set (`src/lib/server/proxy.ts:136-147`). The key needs the `read` scope (`riot-proxy:src/routes/docs.rs:118-126`). See [authentication.md](./authentication.md).
- All calls are `GET` with JSON responses. Deadlines: 5 s for `/v1/lol/analytics/*` and `/v1/static/*`, 30 s for the rest (`src/lib/server/proxy.ts:73-77`).

## Routes used

Twelve of the spec's 70 paths. Required means a failure fails the page.

| Route                                                     | Used by              | Query the site sends                                                                     | Required |
| --------------------------------------------------------- | -------------------- | ---------------------------------------------------------------------------------------- | -------- |
| `GET /v1/players/by-riot-id/{gameName}/{tagLine}/profile` | profile              | `refresh=true` on Refresh only; no `platform`                                            | yes      |
| `GET /v1/players/{puuid}/matches`                         | profile              | `platform`, `start` (page > 1), `count=10`, `queue`, `champion`, `refresh`               | no       |
| `GET /v1/lol/matches/{region}/{matchId}`                  | match                | —                                                                                        | yes      |
| `GET /v1/lol/matches/{region}/{matchId}/timeline`         | match                | —                                                                                        | no       |
| `GET /v1/static/versions`                                 | every page with data | —                                                                                        | yes      |
| `GET /v1/static/{file}`                                   | every page with data | `version`; `file` one of `champion`, `item`, `summoner`, `runesReforged`                 | no*      |
| `GET /v1/static/queues`                                   | every page with data | —                                                                                        | no*      |
| `GET /v1/lol/analytics/champions`                         | `/champions`         | `queue=RANKED_SOLO_5x5`, `patch`, `role`, `tier` or `minTier`, `minGames=0`, `limit=500` | yes      |
| `GET /v1/lol/analytics/champions/{championId}`            | `/champions/{key}`   | as above with `limit=10`                                                                 | yes      |
| `GET /v1/lol/analytics/champions/{championId}/builds`     | `/champions/{key}`   | as above without `limit`, plus `opponentId` against an opponent                          | no       |
| `GET /v1/lol/analytics/champions/{championId}/matchups`   | `/champions/{key}`   | as above with `limit=200`                                                                | no       |
| `GET /v1/lol/analytics/patches`                           | champion pages       | `queue=RANKED_SOLO_5x5`, `championId` on a champion page                                 | no       |

\* The Data Dragon files fall back to plain names when unavailable, except on a champion page, which cannot resolve its URL without them (`src/lib/server/champion-page.ts:92-97`).

Sources: `src/lib/server/profile.ts:78-104`, `src/lib/server/match.ts:36-40`, `src/lib/server/patch.ts:76`, `src/lib/server/static-data.ts:42-51`, `src/lib/server/champions.ts:38-41`, `src/lib/server/champion-page.ts:121-139,181-185`, `src/lib/domain/champion-stats.ts:172-189`.

Parameter values come from site tables: `platform` from `REGIONS` (`src/lib/domain/regions.ts:15-31`); `region` (regional route) from the match id's platform; `role` one of `TOP`, `JUNGLE`, `MIDDLE`, `BOTTOM`, `UTILITY`; `tier`/`minTier` one of Riot's ten tiers (`src/lib/domain/champion-stats.ts:33-57`); `queue` for matches one of 420, 440, 400, 490, 480, 450, 1700 (`src/lib/domain/match-filters.ts:5`); `start` at most 10000 and `champion` 1–10000 (`src/lib/domain/match-filters.ts:7-11`).

## Fields the site reads

The generated types cover every field; this is the subset the site's behaviour depends on.

| Route        | Fields                                                                                                                                                                                                                                                                                   | Code                                                                               |
| ------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| profile      | `platform`, `puuid`, `account.gameName`, `account.tagLine`, `summoner.profileIconId`, `summoner.summonerLevel`, `league[]` (`queueType`, `tier`, `rank`, `leaguePoints`, `wins`, `losses`), `fetchedAgeSeconds.summoner`, `fetchedAgeSeconds.league`, `refreshAvailableIn`, `warnings[]` | `src/lib/server/profile.ts:81-151`, `src/lib/api/riot.ts:11-35`                    |
| matches      | `matches[]` (`matchId`, `queueId`, `gameCreation`, `gameDuration`, `gameVersion`, `ddragonVersion`, `player.*` stats, items, spells, runes, `teamPosition`), `warnings[]`, `matchIdsFetchedAgeSeconds`, `refreshAvailableIn`, `hasMore`, `archive.complete`                              | `src/lib/server/profile.ts:114-149`, `src/lib/domain/matches.ts:48-84`             |
| match        | Riot match-v5 body, untyped in the spec; parsed by hand: `metadata.matchId`, `info.queueId`, `gameCreation`, `gameDuration`, `gameVersion`, `participants[]`, `teams[]`                                                                                                                  | `src/lib/api/match.ts:157-210`                                                     |
| timeline     | Riot timeline body, untyped; `info.frames[]` gold, item, skill and objective events, `info.participants[]` puuids                                                                                                                                                                        | `src/lib/api/match.ts:212-…`                                                       |
| versions     | `current`, else `versions[0]`; `versions[]`                                                                                                                                                                                                                                              | `src/lib/server/patch.ts:16-30`                                                    |
| static files | Data Dragon JSON as published; `queues` as Riot publishes them                                                                                                                                                                                                                           | `src/lib/api/ddragon.ts`                                                           |
| champions    | `patch`, `tier`, `totalGames`, `computedAt`, `champions[]` (`championId`, `championName`, `tier`, `games`, `winRate`, `pickRate`, `banRate`)                                                                                                                                             | `src/lib/domain/champion-stats.ts:217-235`                                         |
| detail       | `patch`, `tier`, `stats[]`, `byTier[]`, `items`, `runes`, `spells`                                                                                                                                                                                                                       | `src/lib/server/champion-page.ts:155-164`, `src/lib/domain/champion-page.ts:35-90` |
| builds       | `role`, `opponentId`, `totalGames`, `builds[]` (`core`, `next`, `boots`, `starter`, `skillOrder`, `runes`, `spells`, `games`, `winRate`, `pickRate`)                                                                                                                                     | `src/lib/domain/champion-page.ts:120-160`                                          |
| matchups     | `matchups[]` (`opponentId`, `opponentName`, `role`, `games`, `winRate`)                                                                                                                                                                                                                  | `src/lib/domain/champion-page.ts:193-225`                                          |
| patches      | `patches[].patch`                                                                                                                                                                                                                                                                        | `src/lib/domain/champion-stats.ts:237-239`                                         |

Semantics the site relies on:

- Without `tier`, analytics rows are summed over every tier with `tier: null`, and a summed row carries the body's own `tier` (`docs/DECISIONS.md:415,575`). The site keeps only rows whose `tier` equals the body's (`src/lib/domain/champion-stats.ts:217-224`).
- Without `role`, set builds name the champion's most-played role (`docs/DECISIONS.md:441`).
- `refreshAvailableIn` is seconds until another refresh is allowed (`riot-proxy:src/routes/players/refresh.rs:22-28`).
- A match id's platform prefix must match `region`, or riot-proxy answers `BAD_REGION`; the site checks first (`src/lib/server/match.ts:34`, `riot-proxy:src/routes/lol.rs:53-64`).
- `MatchSummary.gameVersion` is the game build (`16.20.824.8524`), not a Data Dragon version, despite the spec's wording; the site maps it by `major.minor` (`docs/DECISIONS.md:143`, `src/lib/domain/matches.ts:159-162`).

## Headers the site reads

| Header         | Use                                                       | Code                             |
| -------------- | --------------------------------------------------------- | -------------------------------- |
| `X-Request-Id` | Logged with every failed call                             | `src/lib/server/proxy.ts:14`     |
| `X-Cache`      | Logged with analytics calls over 250 ms                   | `src/lib/server/proxy.ts:58`     |
| `Retry-After`  | Wait time for 429 pages when the body has no `retryAfter` | `src/lib/server/errors.ts:66-74` |

`X-Cache-Age`, `X-Cache-Fetched-Age`, `X-RateLimit-*` and `ETag` are sent by riot-proxy but not read (ADR-007 explains why `X-RateLimit-*` is not used for the retry time, `docs/DECISIONS.md:87`).

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

WebSockets (`/v1/ws`), admin routes, `riot` account routes, live game and mastery routes, `side` filters, `winRateLow` (VS-04 dropped), `/ddragon/…` images and `?token=` authentication (`docs/DECISIONS.md:225,538,595`; inventory section 5).

---

**Sources:** `openapi/riot-proxy.json` (version, path count, sha256), `src/lib/server/proxy.ts:L14-L153`, `src/lib/server/errors.ts:L16-L74`, `src/lib/server/profile.ts:L78-L151`, `src/lib/server/match.ts:L34-L40`, `src/lib/server/patch.ts:L16-L76`, `src/lib/server/static-data.ts:L42-L51`, `src/lib/server/champions.ts:L38-L41`, `src/lib/server/champion-page.ts:L91-L185`, `src/lib/domain/champion-stats.ts:L33-L57,L172-L239`, `src/lib/domain/champion-page.ts:L35-L225`, `src/lib/domain/matches.ts:L48-L84,L159-L162`, `src/lib/domain/match-filters.ts:L5-L11`, `src/lib/domain/regions.ts:L15-L31`, `src/lib/api/match.ts:L157-L215`, `src/lib/api/riot.ts:L11-L35`, `README.md:L51-L66`, `justfile:L16-L22`, `CLAUDE.md:L21-L22`, `docs/DECISIONS.md:L87,L143,L225,L415,L441,L538,L575,L595`, `riot-proxy:src/http/error.rs:L13-L172`, `riot-proxy:src/routes/docs.rs:L118-L126`, `riot-proxy:src/routes/lol.rs:L53-L64`, `riot-proxy:src/routes/players/refresh.rs:L22-L28`
**Last verified:** 2026-11-03 against commit `2948c82`
