# Components

The modules inside ninjagoldfinch.lol, what each is responsible for, and which way the dependencies run.

## Layers

The code is split so that anything holding the riot-proxy key stays on the server, and anything that shapes data is a pure function with a unit test (`CLAUDE.md:31-42`, `docs/IMPLEMENTATION.md:170`).

| Layer           | Path                                                            | Runs on           | Responsibility                                                                                                   |
| --------------- | --------------------------------------------------------------- | ----------------- | ---------------------------------------------------------------------------------------------------------------- |
| hooks           | `src/hooks.server.ts`                                           | server            | Forces cache policy on errors and posts; turns unexpected errors into a generic message (`:5-20`)                |
| env rules       | `src/env.ts`, `src/lib/server/env.ts`                           | server, start-up  | Declares and validates `PROXY_URL`, `PROXY_KEY`, `CDRAGON_URL`, `PUBLIC_SITE_NAME`                               |
| route loads     | `src/routes/**/+page.server.ts`, `+server.ts`                   | server            | Parse the URL, redirect to the canonical URL, call a loader, set `Cache-Control`                                 |
| loaders         | `src/lib/server/{profile,match,champions,champion-page}.ts`     | server            | Make the riot-proxy calls for one page, decide which are essential, build the page's data                        |
| proxy client    | `src/lib/server/proxy.ts`                                       | server            | The one openapi-fetch client: base URL, bearer key, deadlines, failure and slow-call logging                     |
| error mapping   | `src/lib/server/errors.ts`                                      | server            | Maps riot-proxy errors to 404, 429 or 503; `optional()` for calls a page can do without                          |
| cache policy    | `src/lib/server/cache.ts`                                       | server            | The five `Cache-Control` policies and the rule for errors and posts                                              |
| static lookups  | `src/lib/server/{patch,static-data,cdragon}.ts`                 | server            | Current patch (5 min), Data Dragon names (per patch) and CommunityDragon stat shards (per patch), held in memory |
| API types       | `src/lib/api/schema.d.ts`                                       | both (types only) | Generated from `openapi/riot-proxy.json` by `just gen`; never edited by hand                                     |
| API parsers     | `src/lib/api/{match,ddragon,cdragon,riot}.ts`                   | both              | Type and check the Riot and Data Dragon payloads the spec leaves untyped; project the fields the site uses       |
| domain layer    | `src/lib/domain/*.ts`                                           | both              | Pure functions: Riot ID parsing, regions, filters, match rows, builds, timeline maths, champion tables           |
| asset URLs      | `src/lib/assets.ts`                                             | both              | The only place image URLs are built (Data Dragon CDN, CommunityDragon)                                           |
| components      | `src/lib/components/*.svelte`                                   | both              | Rendering; Svelte 5 runes only                                                                                   |
| pages           | `src/routes/**/+page.svelte`, `+layout.svelte`, `+error.svelte` | both              | Compose components; the layout carries the search form and the Riot legal notice                                 |
| browser helpers | `src/lib/recent-storage.ts`                                     | browser           | Recent searches in `localStorage`                                                                                |

SvelteKit refuses to bundle `src/lib/server/` into client code, and no `.svelte` file imports it (checked with `grep -rn "lib/server" src --include=*.svelte`: no hits).

## Dependency diagram

This shows which layer imports which. Arrows point from the importer to what it imports.

```mermaid
flowchart TD
  Pages[pages and components]
  Loads[route loads]
  Hooks[hooks]
  Loaders[loaders]
  Static[static lookups]
  Client[proxy client]
  Errors[error mapping]
  Cache[cache policy]
  Env[env rules]
  Parsers[API parsers]
  Schema[API types schema.d.ts]
  Domain[domain layer]
  Assets[asset URLs]
  Proxy[riot-proxy]
  CDragon[CommunityDragon]

  Loads --> Loaders
  Loads --> Cache
  Loads --> Domain
  Hooks --> Cache
  Loaders --> Client
  Loaders --> Errors
  Loaders --> Static
  Loaders --> Domain
  Loaders --> Parsers
  Static --> Client
  Static --> Parsers
  Static -->|fetch perks.json| CDragon
  Client --> Env
  Client --> Schema
  Client -->|HTTP Bearer key| Proxy
  Errors --> Schema
  Domain --> Parsers
  Domain --> Schema
  Pages --> Domain
  Pages --> Assets
```

The server-only boxes are route loads, hooks, loaders, static lookups, proxy client, error mapping, cache policy and env rules. Pages and components reach only the domain layer, asset URLs and API types, which are shared.

## Loaders

Each page has one loader that owns its riot-proxy calls. Essential calls fail the page; optional calls are wrapped in `optional()` and degrade one section (`src/lib/server/errors.ts:41-58`).

| Loader             | Page                 | Essential calls                                       | Optional calls                                      | Source                                    |
| ------------------ | -------------------- | ----------------------------------------------------- | --------------------------------------------------- | ----------------------------------------- |
| `loadProfile`      | `/summoner/{riotId}` | profile; current patch                                | match page; Data Dragon names (fallback `NO_NAMES`) | `src/lib/server/profile.ts:72-152`        |
| `loadMatch`        | `/match/{matchId}`   | match; patch versions                                 | timeline; Data Dragon names; CommunityDragon shards | `src/lib/server/match.ts:29-73`           |
| `loadChampions`    | `/champions`         | champion table; current patch                         | patch list; Data Dragon names                       | `src/lib/server/champions.ts:33-59`       |
| `findChampionPage` | `/champions/{key}`   | current patch; Data Dragon names (to resolve the URL) | —                                                   | `src/lib/server/champion-page.ts:82-101`  |
| `loadChampionPage` | `/champions/{key}`   | champion detail                                       | set builds; matchups; patch list                    | `src/lib/server/champion-page.ts:111-174` |

The search page (`src/routes/search/+page.server.ts:18-47`) has no loader module: it redirects a Riot ID without calling riot-proxy, and for a champion name it uses the static lookups only.

## Domain modules

| Module                | Main exports                                                                                                                   | Used by                                         |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------- |
| `riot-id.ts`          | `parseRiotIdInput`, `parseRiotId`, `profilePath`, `sameRiotId`                                                                 | search, profile, match pages                    |
| `regions.ts`          | `REGIONS` (15 platforms), `regionForPlatform`, `regionForMatchId`, `findRegion`                                                | profile and match loaders, legacy redirects     |
| `match-filters.ts`    | `FILTER_QUEUES`, `MATCHES_PER_PAGE` (10), `parseMatchFilter`, `filterQuery`                                                    | profile                                         |
| `matches.ts`          | `toMatchRows`, `isCustomGame`, `patchOf`, `itemSlots`, `loadoutOf`                                                             | profile, match                                  |
| `match-detail.ts`     | `toMatchDetail`, `isMatchIdFor`, `matchPath`, `selectBuild`, `asMatchDetail`                                                   | match page, profile rows                        |
| `builds.ts`           | `playerBuild`, `skillOrder`, `skillColumns`, `shopVisits`                                                                      | match page (port of riot-proxy BLD-04, ADR-032) |
| `timeline.ts`         | `objectiveKills`, `goldLead`, `goldAxis`, `nearestFrame`                                                                       | timeline chart                                  |
| `champion-stats.ts`   | `DEFAULT_PATCH`, `MIN_GAMES`, `LOW_SAMPLE_GAMES`, `ROLES`, `TIERS`, `parseChampionFilter`, `analyticsQuery`, `toChampionTable` | champion pages                                  |
| `champion-page.ts`    | `toChampionStats`, `toSetBuilds`, `toMatchups`, `parseVsPick`, `vsChoices`                                                     | champion page                                   |
| `champion-search.ts`  | `champKey`, `findChampion`, `championPath`, `championNames`                                                                    | search, champion pages                          |
| `champion-summary.ts` | `summariseChampions`                                                                                                           | profile side panel                              |
| `ranks.ts`            | `describeRanks`                                                                                                                | profile                                         |
| `error-view.ts`       | `describeError`                                                                                                                | error page, profile match-history notice        |
| `recent.ts`           | `addRecent`, `parseRecent`, `MAX_RECENT` (8)                                                                                   | home page                                       |
| `age.ts`              | `formatAge`                                                                                                                    | profile header                                  |

Each has a test in `tests/unit/` with the same base name.

## Components

19 components in `src/lib/components/`. The larger ones: `TimelineChart` (hand-written SVG gold chart, ADR-029/031), `SetBuilds` (champion build tabs), `BuildPanel` (one player's build in a dialog, ADR-028), `Scoreboard`, `MatchRow` (a profile row, with the inline teams view that uses `preloadData`, ADR-030), `ProfileHeader` (refresh form with `use:enhance`, ADR-012). `ChampionIcon`, `ItemIcon`, `ItemList` and `Loadout` build image URLs only through `src/lib/assets.ts`.

---

**Sources:** `src/hooks.server.ts:L5-L20`, `src/env.ts:L12-L31`, `src/lib/server/proxy.ts:L1-L153`, `src/lib/server/errors.ts:L41-L58`, `src/lib/server/profile.ts:L72-L152`, `src/lib/server/match.ts:L29-L73`, `src/lib/server/champions.ts:L33-L59`, `src/lib/server/champion-page.ts:L82-L174`, `src/routes/search/+page.server.ts:L18-L47`, `src/lib/domain/*.ts` (exports), `src/lib/components/*.svelte` (imports), `CLAUDE.md:L31-L42`, `docs/IMPLEMENTATION.md:L170`
**Last verified:** 2026-11-03 against commit `2948c82`
