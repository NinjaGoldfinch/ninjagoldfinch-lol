# Components

The modules inside ninjagoldfinch.lol, what each is responsible for, and which way the dependencies run.

## Layers

The code is split so that anything holding the riot-proxy key stays on the server, and anything that shapes data is a pure function with a unit test (`CLAUDE.md:31-42`, `docs/IMPLEMENTATION.md:172`).

| Layer           | Path                                                            | Runs on           | Responsibility                                                                                                                                                                                                    |
| --------------- | --------------------------------------------------------------- | ----------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| hooks           | `src/hooks.server.ts`                                           | server            | Starts loading the current patch and its lookups at start-up (`init`, `:7-13`); forces cache policy on errors and posts, `no-store` where none was set; turns unexpected errors into a generic message (`:15-39`) |
| env rules       | `src/env.ts`, `src/lib/server/env.ts`                           | server, start-up  | Declares and validates `PROXY_URL`, `PROXY_KEY`, `CDRAGON_URL`, `PUBLIC_SITE_NAME`                                                                                                                                |
| route loads     | `src/routes/**/+page.server.ts`, `+server.ts`                   | server            | Parse the URL, redirect to the canonical URL, call a loader, set `Cache-Control`                                                                                                                                  |
| loaders         | `src/lib/server/{profile,match,champions,champion-page}.ts`     | server            | Make the riot-proxy calls for one page, decide which are essential, build the page's data                                                                                                                         |
| proxy client    | `src/lib/server/proxy.ts`                                       | server            | The one openapi-fetch client: base URL, bearer key, deadlines, failure and slow-call logging                                                                                                                      |
| load timing     | `src/lib/server/timing.ts`                                      | server            | Records each request's riot-proxy calls (`timeCalls`) and logs a request slower than 100 ms (`timeLoad`, ADR-046)                                                                                                 |
| error mapping   | `src/lib/server/errors.ts`                                      | server            | Maps riot-proxy errors to 404, 429 or 503; `optional()` for calls a page can do without; `early()` for calls started before they are awaited                                                                      |
| cache policy    | `src/lib/server/cache.ts`                                       | server            | The six `Cache-Control` policies and the rule for errors and posts                                                                                                                                                |
| static lookups  | `src/lib/server/{patch,static-data,cdragon}.ts`                 | server            | Current patch (refreshed in the background after 5 min), Data Dragon names and CommunityDragon stat shards (two patches each), held in memory and loaded at start-up                                              |
| API types       | `src/lib/api/schema.d.ts`                                       | both (types only) | Generated from `openapi/riot-proxy.json` by `just gen`; never edited by hand                                                                                                                                      |
| API parsers     | `src/lib/api/{match,ddragon,cdragon,riot}.ts`                   | both              | Type and check the Riot and Data Dragon payloads the spec leaves untyped; project the fields the site uses                                                                                                        |
| domain layer    | `src/lib/domain/*.ts`                                           | both              | Pure functions: Riot ID parsing, regions, filters, match rows, builds, timeline maths, champion tables                                                                                                            |
| asset URLs      | `src/lib/assets.ts`                                             | both              | The only place image URLs are built (Data Dragon CDN, CommunityDragon); exports the two hosts' origins, `DDRAGON_ORIGIN` and `CDRAGON_ORIGIN`, for `<link rel="preconnect">` (`:12-19`)                           |
| components      | `src/lib/components/*.svelte`                                   | both              | Rendering; Svelte 5 runes only                                                                                                                                                                                    |
| pages           | `src/routes/**/+page.svelte`, `+layout.svelte`, `+error.svelte` | both              | Compose components; the layout carries the search form, the Riot legal notice and a preconnect to Data Dragon; the profile and match pages add one to CommunityDragon                                             |
| browser helpers | `src/lib/recent-storage.ts`                                     | browser           | Recent searches in `localStorage`                                                                                                                                                                                 |

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
  Timing[load timing]
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
  Hooks --> Timing
  Hooks -->|warm at start-up| Static
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
  Client --> Timing
  Client -->|HTTP Bearer key| Proxy
  Errors --> Schema
  Domain --> Parsers
  Domain --> Schema
  Pages --> Domain
  Pages --> Assets
```

The server-only boxes are route loads, hooks, loaders, static lookups, proxy client, load timing, error mapping, cache policy and env rules. Pages and components reach only the domain layer, asset URLs and API types, which are shared.

## Loaders

Each page has one loader that owns its riot-proxy calls. Essential calls fail the page; optional calls are wrapped in `optional()` and degrade one section (`src/lib/server/errors.ts:41-58`). Calls that do not depend on each other start together: the current patch and its lookups run alongside the page's own calls, not after them (SPD-08). A chain started before the call that can fail the page is wrapped in `early()`, so it leaves no unhandled rejection when the page fails first (`src/lib/server/errors.ts:60-68`).

| Loader             | Page                 | Essential calls                                       | Optional calls                                                         | Source                                    |
| ------------------ | -------------------- | ----------------------------------------------------- | ---------------------------------------------------------------------- | ----------------------------------------- |
| `loadProfile`      | `/summoner/{riotId}` | profile; current patch                                | match page; Data Dragon names (`namesOrFallback`, fallback `NO_NAMES`) | `src/lib/server/profile.ts:71-155`        |
| `loadMatch`        | `/match/{matchId}`   | match; patch versions                                 | timeline; Data Dragon names; CommunityDragon shards                    | `src/lib/server/match.ts:34-85`           |
| `loadChampions`    | `/champions`         | champion table; current patch                         | patch list; Data Dragon names                                          | `src/lib/server/champions.ts:33-62`       |
| `findChampionPage` | `/champions/{key}`   | current patch; Data Dragon names (to resolve the URL) | —                                                                      | `src/lib/server/champion-page.ts:82-101`  |
| `loadChampionPage` | `/champions/{key}`   | champion detail                                       | set builds; matchups; patch list                                       | `src/lib/server/champion-page.ts:111-175` |

The search page (`src/routes/search/+page.server.ts:18-47`) has no loader module: it redirects a Riot ID without calling riot-proxy, and for a champion name it uses the static lookups only.

## Domain modules

| Module                | Main exports                                                                                                                            | Used by                                                                                                                                          |
| --------------------- | --------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| `riot-id.ts`          | `parseRiotIdInput`, `parseRiotId`, `profilePath`, `riotIdKey`, `sameRiotId`                                                             | search, profile, match pages                                                                                                                     |
| `regions.ts`          | `REGIONS` (15 platforms), `regionForPlatform`, `regionForMatchId`, `findRegion`                                                         | profile and match loaders, legacy redirects                                                                                                      |
| `match-filters.ts`    | `FILTER_QUEUES`, `MATCHES_PER_PAGE` (10), `parseMatchFilter`, `filterQuery`                                                             | profile                                                                                                                                          |
| `matches.ts`          | `toMatchRows`, `isCustomGame`, `patchOf`, `itemSlots`, `loadoutOf`                                                                      | profile, match                                                                                                                                   |
| `match-detail.ts`     | `toMatchDetail`, `isMatchIdFor`, `matchPath`, `selectBuild`, `asMatchDetail`                                                            | match page, profile rows                                                                                                                         |
| `builds.ts`           | `playerBuild`, `skillOrder`, `skillColumns`, `shopVisits`                                                                               | match page (port of riot-proxy BLD-04, ADR-032)                                                                                                  |
| `timeline.ts`         | `objectiveKills`, `goldLead`, `goldAxis`, `nearestFrame`                                                                                | timeline chart                                                                                                                                   |
| `champion-stats.ts`   | `DEFAULT_PATCH`, `MIN_GAMES`, `LOW_SAMPLE_GAMES`, `ROLES`, `LANES`, `TIERS`, `parseChampionFilter`, `analyticsQuery`, `toChampionTable` | champion pages                                                                                                                                   |
| `champion-page.ts`    | `toChampionStats`, `toSetBuilds`, `toMatchups`, `parseVsPick`, `vsChoices`                                                              | champion page                                                                                                                                    |
| `champion-search.ts`  | `champKey`, `findChampion`, `championPath`, `championNames`                                                                             | search, champion pages                                                                                                                           |
| `champion-summary.ts` | `summariseChampions`                                                                                                                    | profile side panel                                                                                                                               |
| `ranks.ts`            | `describeRanks`, `soloRankLabel`                                                                                                        | profile; `soloRankLabel` gives the rank a recent search records (ADR-068)                                                                        |
| `error-view.ts`       | `describeError`                                                                                                                         | error page, profile match-history notice                                                                                                         |
| `recent.ts`           | `RecentSearch`, `addRecent`, `parseRecent`, `MAX_RECENT` (8)                                                                            | `src/lib/recent-storage.ts`, for the profile, which records each view and refresh, and the home page's `RecentSearches` cards (ADR-068, ADR-073) |
| `age.ts`              | `formatAge`, `ageSince`                                                                                                                 | profile header and the home page's status card (`formatAge`); the home page's recent searches (`ageSince`)                                       |
| `names.ts`            | `itemName`, `queueName`, `championName` (fallbacks when the lookups lack an id)                                                         | the domain modules above                                                                                                                         |

Each has a test in `tests/unit/` with the same base name.

## Components

19 components in `src/lib/components/`. The larger ones: `TimelineChart` (hand-written SVG gold chart, ADR-029/031), `SetBuilds` (champion build tabs), `BuildPanel` (one player's build in a dialog, ADR-028), `Scoreboard`, `MatchRow` (a profile row, with the inline teams view that uses `preloadData`, ADR-030), `ProfileHeader` (refresh form with `use:enhance`, ADR-012). `ChampionIcon`, `ItemIcon`, `ItemList` and `Loadout` build image URLs only through `src/lib/assets.ts`. Every `<img>` has `width`, `height` and `decoding="async"`; below-the-fold images are `loading="lazy"`. `ChampionIcon` takes a `priority` prop for a page's main image (`loading="eager"`, `fetchpriority="high"`), used for the champion page's header icon; `ProfileHeader`'s profile icon is eager with `fetchpriority="high"` (SPD-10).

---

**Sources:** `src/hooks.server.ts:L1-L39`, `src/lib/server/patch.ts:L46-L146`, `src/lib/server/static-data.ts:L22-L51`, `src/lib/server/cdragon.ts:L1-L37`, `src/env.ts:L12-L31`, `src/lib/server/proxy.ts:L1-L154`, `src/lib/server/timing.ts:L1-L95`, `src/lib/server/errors.ts:L41-L68`, `src/lib/server/profile.ts:L71-L155`, `src/lib/server/match.ts:L34-L85`, `src/lib/server/champions.ts:L33-L62`, `src/lib/server/champion-page.ts:L82-L175`, `src/routes/search/+page.server.ts:L18-L47`, `src/lib/domain/*.ts` (exports), `src/lib/components/*.svelte` (imports), `src/lib/assets.ts:L12-L19`, `src/lib/components/ChampionIcon.svelte:L1-L24`, `src/lib/components/ProfileHeader.svelte:L44-L54`, `src/routes/+layout.svelte:L21-L24`, `src/lib/domain/ranks.ts:L23-L51`, `src/lib/domain/recent.ts:L5-L22`, `src/lib/domain/age.ts:L1-L16`, `src/lib/recent-storage.ts:L1-L22`, `src/lib/components/RecentSearches.svelte:L1-L32`, `src/lib/components/StatusCard.svelte:L3`, `src/routes/summoner/[riotId]/+page.svelte:L13-L41`, `CLAUDE.md:L31-L42`, `docs/IMPLEMENTATION.md:L172`
**Last verified:** 2026-11-03 against commit `ea998cb`; the `ranks.ts`, `recent.ts` and `age.ts` rows on 2026-11-09 against `f68591e`
