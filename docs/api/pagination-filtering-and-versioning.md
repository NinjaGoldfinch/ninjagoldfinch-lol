# Pagination, filtering and versioning

How the site's URLs carry pages and filters, why every view has exactly one canonical URL, and how URL changes and riot-proxy versions are handled.

## Principles

- **Filters live in the query string**, so every view is linkable and cacheable (`docs/IMPLEMENTATION.md:277`).
- **One URL per view.** A load that receives defaults, empty values or unknown values redirects to the clean URL, so the edge cache holds one copy per view (ADR-033, `docs/DECISIONS.md:423`).
- **Presentation-only parameters are read by the page, not the load**, so changing them with JavaScript needs no request: `sort` on `/champions`, `build` on champion pages, `player`, `tab` and `build` on match pages.

## Profile pagination and filters

`/summoner/{riotId}` shows ten matches a page (`MATCHES_PER_PAGE`, `src/lib/domain/match-filters.ts:7`).

| Query      | Values                                  | riot-proxy query                |
| ---------- | --------------------------------------- | ------------------------------- |
| `page`     | 1 to 1001 (`MAX_PAGE` = 10000 / 10 + 1) | `start=(page-1)*10`, `count=10` |
| `queue`    | 420, 440, 400, 490, 480, 450, 1700      | `queue`                         |
| `champion` | champion ID 1–10000                     | `champion`                      |

Sources: `src/lib/domain/match-filters.ts:5-37`, `src/lib/server/profile.ts:89-99`.

- The "Older" link appears when riot-proxy's `hasMore` is true and the page is below 1001; "Newer" from page 2 (`src/lib/components/Pagination.svelte:9-17`). riot-proxy sets `hasMore` when a full page came back, exactly when filtering by champion (`riot-proxy:src/routes/players.rs:697,866`).
- Custom games are removed after the page is fetched, so a page may show fewer than ten rows, with a note (ADR-017).
- With a champion filter the matches come from riot-proxy's archive; while its backfill of the player's history is incomplete (`archive.complete: false`) the page says older games are still arriving (`src/lib/server/profile.ts:43-48`, `src/routes/summoner/[riotId]/+page.svelte:99`).
- Canonical form, in this order: `?queue=…&champion=…&page=…`, defaults left out (`src/lib/domain/match-filters.ts:39-50`). Anything else on a GET gets `307` to it (`src/routes/summoner/[riotId]/+page.server.ts:18-22`).
- Refresh keeps the filter: `?queue=420&/refresh` (`src/lib/domain/match-filters.ts:52-59`).

## Champion filters

Shared by `/champions` and `/champions/{key}` (`src/lib/domain/champion-stats.ts:66-176`):

| Query               | Values                                    | Default                 | Canonical form                     |
| ------------------- | ----------------------------------------- | ----------------------- | ---------------------------------- |
| `role`              | `top`, `jungle`, `mid`, `bot`, `support`  | every role              | omitted when default               |
| `rank`              | `<tier>` or `<tier>+`, Iron to Challenger | every tier              | `diamond+` written with a bare `+` |
| `patch`             | `all`, `newest`, `major.minor`            | `all` (`DEFAULT_PATCH`) | omitted when `all`                 |
| `sort` (table only) | `pick`, `win`, `ban`                      | `pick`                  | omitted when `pick`                |

Order in the canonical query: `role`, `rank`, `patch`, `sort` (`src/lib/domain/champion-stats.ts:160-176`).

Rank encoding (ADR-042, `docs/DECISIONS.md:574`): `?rank=diamond+`, `?rank=diamond%2B` and `?rank=diamond%20` (a bare `+` decoded as a space) all mean Diamond and above, and the page redirects to the bare `+`. `challenger+` becomes `challenger`. An unknown rank means every tier, never an error.

Champion page extras: `vs=<champion key>` and `lane=<role>` pick builds against a lane opponent; `vs` is read without regard to case and written lower case, an unknown `vs` drops the pick, an unknown `lane` only the lane, and `lane` is dropped when `role` is set (`src/lib/domain/champion-page.ts:212-244`). `build=<n>` (1-based) picks a build tab and is kept in the canonical URL but not read by the load (`src/routes/champions/[key]/+page.server.ts:15-26`).

Redirect status: `/champions` uses `307` (`src/routes/champions/+page.server.ts:14`). `/champions/{key}` uses `308` for a non-canonical key such as `Ahri` or `wukong`, carrying the canonical query, and `307` when only the query needs tidying (`src/routes/champions/[key]/+page.server.ts:21-26`, ADR-045). The query redirect is temporary because a default or a champion the lookups do not know yet can change. Every redirect is sent `no-store` (`src/hooks.server.ts:8-13`).

Analytics lists are not paginated: the table asks riot-proxy for `limit=500`, the detail for `limit=10`, matchups for `limit=200` (`src/lib/domain/champion-stats.ts:191-194`, `src/lib/server/champion-page.ts:123,132`).

## Match page parameters

`player=<GameName-TAG>`, `tab=timeline` and `build=<participant id>` are read in the browser (`src/routes/match/[matchId]/+page.svelte:32,51,68`). The server ignores them and does not redirect, but each combination is a separate edge cache entry (ADR-024).

## URL versioning

The site's URLs are not versioned. When the scheme changed, old URLs kept working with permanent redirects (ADR-037, `docs/DECISIONS.md:493`):

| Old                                 | New                        | Status          |
| ----------------------------------- | -------------------------- | --------------- |
| `/summoner/{region}/{GameName-TAG}` | `/summoner/{GameName-TAG}` | 308, query kept |
| `/match/{region}/{matchId}`         | `/match/{matchId}`         | 308, query kept |
| `/search?riotId=…`                  | still read as `q`          | —               |

An old URL whose region slug the site never knew is `404`.

## riot-proxy versioning

riot-proxy's routes are under `/v1`. The site pins a riot-proxy version by committing its spec (`openapi/riot-proxy.json`, 2.7.0) and generating types from it; `just check` fails when they drift (`README.md:52-67`, `justfile:20-22`). Upgrading means refreshing the spec from the release binary, fixing any type errors, and updating fixtures that the spec now requires fields for (`tests/unit/fixtures-spec.test.ts`, VS-01).

---

**Sources:** `src/lib/domain/match-filters.ts:L5-L59`, `src/lib/components/Pagination.svelte:L9-L17`, `src/lib/server/profile.ts:L43-L48,L89-L99`, `src/routes/summoner/[riotId]/+page.server.ts:L18-L22`, `src/routes/summoner/[riotId]/+page.svelte:L99`, `src/lib/domain/champion-stats.ts:L66-L194`, `src/lib/domain/champion-page.ts:L212-L244`, `src/lib/server/champion-page.ts:L123,L132`, `src/routes/champions/+page.server.ts:L14`, `src/routes/champions/[key]/+page.server.ts:L15-L26`, `src/hooks.server.ts:L8-L13`, `src/routes/match/[matchId]/+page.svelte:L32-L68`, `docs/IMPLEMENTATION.md:L277`, `docs/DECISIONS.md:L423,L493,L574,L617-L630`, `README.md:L52-L67`, `justfile:L20-L22`, `riot-proxy:src/routes/players.rs:L697,L866`
**Last verified:** 2026-11-03 against commit `03faa33`
