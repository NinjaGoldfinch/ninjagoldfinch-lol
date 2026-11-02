# Caching

Every cache between Riot and a visitor that affects what ninjagoldfinch.lol shows: what is cached, where, keyed by what, for how long, and how it is invalidated.

## Layers

| Layer               | Owner              | Holds                                           | Key                                       | Lifetime                                      |
| ------------------- | ------------------ | ----------------------------------------------- | ----------------------------------------- | --------------------------------------------- |
| Browser             | visitor            | Hashed JS and CSS; recent searches              | URL; `localStorage` key `recent-searches` | 1 year for `/_app/immutable/*`; until cleared |
| Cloudflare edge     | Cloudflare         | Rendered pages                                  | Full URL, query included                  | Per `Cache-Control`                           |
| Site process memory | ninjagoldfinch.lol | Current patch; Data Dragon lookups; stat shards | none; patch; patch                        | 5 min; one patch; one patch                   |
| riot-proxy          | riot-proxy         | Riot responses, archive, analytics              | endpoint and arguments                    | Per endpoint                                  |

## Edge cache (Cloudflare)

The site sets `Cache-Control` on every page load from five policies (`src/lib/server/cache.ts:5-16`):

| Policy      | Header                                                 | Used for                                                                                                                                    |
| ----------- | ------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------- |
| `profile`   | `public, s-maxage=60, stale-while-revalidate=300`      | `/summoner/{riotId}` with match history                                                                                                     |
| `match`     | `public, s-maxage=86400, stale-while-revalidate=86400` | `/match/{matchId}` with every part loaded                                                                                                   |
| `analytics` | `public, s-maxage=600, stale-while-revalidate=600`     | `/champions`, `/champions/{key}`, with every part loaded                                                                                    |
| `notFound`  | `public, s-maxage=60`                                  | every 404                                                                                                                                   |
| `none`      | `no-store`                                             | `/healthz`, `/search`, form posts, errors other than 404, redirects, any response no load gave a policy, a page with a part missing (below) |

Rules:

- The `handle` hook overrides whatever a load set: non-GET/HEAD responses are `none`, 404 is `notFound`, any other status of 400 or above is `none` (`src/lib/server/cache.ts:24-34`, `src/hooks.server.ts:6-15`). A rate-limit page is therefore never served to the next visitor.
- After those rules, a response with no `Cache-Control` gets `none` (`src/hooks.server.ts:8-13`, ADR-045). That covers redirects thrown before a load set a policy: the profile's and `/champions`' query tidying (307), a champion's name (308) and query (307), and the old region URLs (308). `/search` sets `none` itself before its 303s (`src/routes/search/+page.server.ts:19`).
- A page with a part missing gets `none`, so the gap is not kept at the edge: a profile without its match history; a match without its timeline, Data Dragon lookups or stat shards; `/champions` without its patch list or lookups; a champion page without its set builds, matchups or patch list. The loads return `complete` for this (`src/lib/server/match.ts:62-82`, `src/lib/server/champions.ts:50-53`, `src/lib/server/champion-page.ts:175`, ADR-045).
- `s-maxage` applies to shared caches only, so browsers revalidate pages themselves.
- Each URL, query included, is its own entry; Cloudflare's cache key includes the query string (checked from outside, `docs/DECISIONS.md:577`). Canonical-URL redirects keep one entry per view (see [../api/pagination-filtering-and-versioning.md](../api/pagination-filtering-and-versioning.md)).
- Match pages' `player`, `tab` and `build` parameters create separate entries for the same data (ADR-024).
- `/` and `/about` are prerendered files with an ETag, served before `handle` runs, so the `none` default does not reach them (`src/routes/+page.ts:3`, `src/routes/about/+page.ts:2`). Neither calls riot-proxy.
- `__data.json` answers come from SvelteKit with `private, no-store`, even when a load threw: a redirect, or an error in a load, is a 200 carrying a redirect or error node (`node_modules/@sveltejs/kit/src/runtime/server/data/index.js:89-148`). Headers a load set with `setHeaders` are then copied onto the response, replacing that (`node_modules/@sveltejs/kit/src/runtime/server/respond.js:212-237,513-516`). So a data answer carries its page's policy when the load got as far as `setHeaders`, and `private, no-store` otherwise. The profile's was observed to match its page.
- `/_app/immutable/*` is served with `public,max-age=31536000,immutable` by adapter-node (observed 2026-10-19).

Measured through Cloudflare on 2026-10-15: `MISS` 55–69 ms, then `HIT` 25–30 ms for champion pages (`docs/DECISIONS.md:527`).

Cloudflare does not cache HTML unless a cache rule says so; the plan calls for one that respects origin `Cache-Control` (`docs/IMPLEMENTATION.md:386`). ADR-039 and ADR-042 record `HIT`s on production pages, so a rule exists.

> **TODO (unverified):** the Cloudflare cache rule's exact settings, and whether `__data.json` responses with a `public` policy are cached (SPD-06, `docs/PROGRESS.md:55`). Read them in the Cloudflare dashboard.

**Invalidation.** Nothing purges the edge. A page changes when its `s-maxage` lapses: a profile within 60 s (plus up to 300 s stale while revalidating), analytics within 10 min, a match within a day. Refresh bypasses it by returning the fresh profile in the POST response (ADR-012).

## Site in-memory lookups

The site caches no Riot player data and no analytics (`docs/DECISIONS.md:165,560`). Three lookups that cannot change within a patch are held per process:

| Lookup          | Code                                  | Contents                                                                       | Key   | Lifetime and invalidation       |
| --------------- | ------------------------------------- | ------------------------------------------------------------------------------ | ----- | ------------------------------- |
| `patchVersions` | `src/lib/server/patch.ts:47-68`       | Current Data Dragon version and Riot's version list from `/v1/static/versions` | —     | `PATCH_TTL_MS` 5 min            |
| `staticNames`   | `src/lib/server/static-data.ts:24-39` | Champion, item, spell, queue and rune names; item catalogue                    | patch | Replaced when the patch changes |
| `statShards`    | `src/lib/server/cdragon.ts:9-39`      | CommunityDragon stat shard names and icons (ids 5001–5013)                     | patch | Replaced when the patch changes |

- One patch is held at a time; the previous one is dropped (`src/lib/server/static-data.ts:26`).
- Concurrent requests share one in-flight fetch; a failed fetch is forgotten so the next request retries.
- There is no size limit setting. The inputs are about 700 kB (`item.json`) and 160 kB (`champion.json`) before reduction (`docs/DECISIONS.md:163`) and about 100 kB for `perks.json` (`docs/DECISIONS.md:319`); the held lookups are smaller.
- **Cold start:** after a restart the first page view fetches all three. Measured in ADR-013: 831 ms for the first profile view, 56 ms after (`docs/DECISIONS.md:165`).
- **Patch change:** pages keep the old patch's names and icons for up to 5 minutes after riot-proxy's mirror moves (`docs/DECISIONS.md:562`).
- To clear them, restart the service (`sudo systemctl restart ninjagoldfinch-lol`). Tests call `clearPatchVersions`, `clearStaticNames` and `clearStatShards`.

## riot-proxy's caches, as the site sees them

Owned and documented by riot-proxy; summarised for context.

| What                      | Behaviour                                                                                                                 | Source                                                                        |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| Riot responses            | In-memory L1 (`CACHE_L1_MAX_MB` 128) plus SQLite; per-endpoint soft TTLs, hard TTL = soft × 4 with stale-while-revalidate | `riot-proxy:src/riot/endpoints.rs:14,476-496`, `riot-proxy:src/config.rs:713` |
| Profile parts             | account 86,400 s, summoner 3,600 s, league 300 s, mastery 3,600 s                                                         | `riot-proxy:src/riot/endpoints.rs:93-132,225-234`                             |
| Match id lists            | 120 s soft TTL                                                                                                            | `riot-proxy:src/riot/endpoints.rs:175-184`                                    |
| Matches and timelines     | Immutable; archived, then `X-Cache: ARCHIVE`                                                                              | `riot-proxy:src/riot/endpoints.rs:185-204`                                    |
| Not found                 | 30 s, 300 s for account lookups                                                                                           | `riot-proxy:src/config.rs:714-715`                                            |
| Analytics                 | In-memory LRU of 512 responses, cleared on each rebuild; `X-Cache: HIT`/`MISS`                                            | `riot-proxy:src/routes/analytics/cache.rs:1-19`                               |
| Static Data Dragon mirror | Synced every `DDRAGON_SYNC_S` (3600 s); `X-Cache: HIT`                                                                    | `riot-proxy:src/config.rs:726`, `riot-proxy:src/routes/statics.rs:161-167`    |
| Refresh window            | One `refresh=true` per player and part per 60 s, in memory                                                                | `riot-proxy:src/routes/players/refresh.rs:17-18`                              |

A profile's "Updated N minutes ago" comes from riot-proxy's `fetchedAgeSeconds`, so it reflects riot-proxy's cache, plus up to the edge cache's age (ADR-019, `docs/DECISIONS.md:233`).

---

**Sources:** `src/lib/server/cache.ts:L5-L34`, `src/hooks.server.ts:L6-L15`, `src/routes/+page.ts:L3`, `src/routes/about/+page.ts:L2`, `src/routes/search/+page.server.ts:L19`, `src/lib/server/match.ts:L62-L82`, `src/lib/server/champions.ts:L50-L53`, `src/lib/server/champion-page.ts:L175`, `node_modules/@sveltejs/kit/src/runtime/server/data/index.js:L89-L148`, `node_modules/@sveltejs/kit/src/runtime/server/respond.js:L212-L237,L513-L516`, `src/lib/server/patch.ts:L47-L73`, `src/lib/server/static-data.ts:L24-L69`, `src/lib/server/cdragon.ts:L9-L44`, `src/lib/recent-storage.ts:L6`, `docs/DECISIONS.md:L163-L165,L233,L319,L527,L560-L562,L577,L615-L628`, `docs/IMPLEMENTATION.md:L386`, `docs/PROGRESS.md:L55`, `riot-proxy:src/riot/endpoints.rs:L14-L496`, `riot-proxy:src/config.rs:L713-L715,L726`, `riot-proxy:src/routes/analytics/cache.rs:L1-L19`, `riot-proxy:src/routes/statics.rs:L161-L167`, `riot-proxy:src/routes/players/refresh.rs:L17-L18`; headers observed on `node build` 2026-10-19
**Last verified:** 2026-11-03 against commit `99cb82c`
