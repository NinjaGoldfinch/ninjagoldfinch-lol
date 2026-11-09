# Vocabulary

The one list of names used across `docs/`. If a document needs a name that is not here, add it here first.

## Services and external systems

| Name (use exactly)    | What it is                                                                                                                   | In diagrams as          |
| --------------------- | ---------------------------------------------------------------------------------------------------------------------------- | ----------------------- |
| Browser               | A visitor's web browser                                                                                                      | `Browser`               |
| Cloudflare            | Cloudflare's edge: DNS, cache, WAF and the Tunnel's public side                                                              | `Cloudflare`            |
| cloudflared           | The Tunnel connector running as a system service on the production host                                                      | `cloudflared`           |
| ninjagoldfinch.lol    | This repo: the SvelteKit site, run in production and staging as a release, `node build` under systemd                        | `ninjagoldfinch.lol`    |
| riot-proxy            | The API in front of Riot; owns the Riot key, caching, archive and analytics                                                  | `riot-proxy`            |
| ninja-monitor         | Per-service CPU, RAM and disk monitoring with Discord alerts                                                                 | `ninja-monitor`         |
| ninja-ingest          | ninja-monitor's central server, in the same repository: weeks of history for several hosts, with a heartbeat of its own      | `ninja-ingest`          |
| Healthchecks.io       | Pinged each minute by a heartbeat from `ngf-mon-syd1`; emails the owner when the pings stop                                  | `Healthchecks.io`       |
| Riot API              | Riot Games' developer API                                                                                                    | `Riot API`              |
| Data Dragon CDN       | `ddragon.leagueoflegends.com`, where the Browser loads game images                                                           | `Data Dragon CDN`       |
| CommunityDragon       | `raw.communitydragon.org` (or a mirror set by `CDRAGON_URL`)                                                                 | `CommunityDragon`       |
| Onidel Object Storage | Onidel's S3-compatible storage in Sydney; riot-proxy's archive store                                                         | `Onidel Object Storage` |
| Cloudflare R2         | Cloudflare's S3-compatible storage; riot-proxy's archive replica and backups                                                 | `Cloudflare R2`         |
| GitHub                | Hosts both repos and their releases                                                                                          | `GitHub`                |
| GitHub Actions        | CI for both repositories; the site's runs the gate, builds releases and deploys them (ADR-050, ADR-052, ADR-053, ADR-057)    | `GitHub Actions`        |
| ninja-actions         | `NinjaGoldfinch/ninja-actions`, the shared pipeline: the deploy action and the host scripts (ADR-050)                        | `ninja-actions`         |
| ninja-deploy          | ninja-actions' script on each deploy host: unpacks a release, links `current`, restarts, health-checks, rolls back (ADR-053) | `ninja-deploy`          |
| status bot            | The owner's bot that polls each service's status endpoint, here `/api/status` (ADR-062); not in this repo                    | `status bot`            |
| events receiver       | Whatever `EVENTS_URL` points at, which takes the site's events (ADR-063); not in this repo                                   | `events receiver`       |
| mock proxy            | `tests/mock-proxy/`, a stand-in for riot-proxy that replays `tests/fixtures/`                                                | `mock proxy`            |
| production host       | The Onidel ONI-4 VPS `ngf-prod-syd1` in Sydney that runs both services                                                       | `ngf-prod-syd1`         |
| monitoring host       | `ngf-mon-syd1`, the former production box, now running ninja-monitor and the site's staging copy (OVH, `ENV=staging`)        | `ngf-mon-syd1`          |

### Components inside ninjagoldfinch.lol

| Name             | Code                                                              |
| ---------------- | ----------------------------------------------------------------- |
| SvelteKit server | adapter-node output, `node build`                                 |
| hooks            | `src/hooks.server.ts` (`handle`, `handleError`)                   |
| route loads      | `src/routes/**/+page.server.ts`, `+server.ts`                     |
| loaders          | `src/lib/server/{profile,match,champions,champion-page}.ts`       |
| proxy client     | `src/lib/server/proxy.ts` (`proxy`, the one openapi-fetch client) |
| error mapping    | `src/lib/server/errors.ts` (`toHttpError`, `optional`)            |
| cache policy     | `src/lib/server/cache.ts` (`CACHE_POLICIES`)                      |
| static lookups   | `src/lib/server/{patch,static-data,cdragon}.ts` (in-memory holds) |
| env rules        | `src/env.ts`, `src/lib/server/env.ts`                             |
| API parsers      | `src/lib/api/*.ts` (`schema.d.ts` is generated)                   |
| domain layer     | `src/lib/domain/*.ts` (pure functions)                            |
| components       | `src/lib/components/*.svelte`                                     |
| asset URLs       | `src/lib/assets.ts`                                               |

## Environments

| Name                    | Site URL                                                                                                     | riot-proxy (`PROXY_URL`)                                | Key                                                  | Status      |
| ----------------------- | ------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------- | ---------------------------------------------------- | ----------- |
| production              | `https://ninjagoldfinch.lol` (listens `127.0.0.1:3000`)                                                      | `http://127.0.0.1:8080`                                 | `ninjagoldfinch-lol-prod`                            | live        |
| local dev               | Vite dev server on your machine                                                                              | a riot-proxy you run yourself                           | none if `AUTH_DISABLED=true`, else your own read key | active      |
| staging                 | `https://staging.ninjagoldfinch.lol`, behind Cloudflare Access, on `ngf-mon-syd1` (listens `127.0.0.1:3000`) | production riot-proxy, `https://api.ninjagoldfinch.lol` | `ninjagoldfinch-lol-staging`                         | live        |
| test                    | `http://localhost:4173` (`node build`)                                                                       | mock proxy `http://127.0.0.1:8787`                      | placeholder `e2e-placeholder`                        | active      |
| LAN dev proxy (dormant) | —                                                                                                            | `http://192.168.68.46:8080`, no auth                    | none                                                 | not running |

Public hostnames on the production Tunnel: `ninjagoldfinch.lol` (the site), `api.ninjagoldfinch.lol` and `admin.ninjagoldfinch.lol` (riot-proxy). `staging.ninjagoldfinch.lol` is on a tunnel of its own, from `ngf-mon-syd1` (ADR-057, ADR-058).

## Keys and credentials

Names only. Values never appear in `docs/`.

| Name                         | Holder                                                                | Purpose and scope                                                                                                    |
| ---------------------------- | --------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| `PROXY_KEY`                  | ninjagoldfinch.lol (env var)                                          | The variable that carries the site's riot-proxy consumer key                                                         |
| `ninjagoldfinch-lol-prod`    | riot-proxy consumer                                                   | Production's consumer key, `read` scope                                                                              |
| `ninjagoldfinch-lol-staging` | riot-proxy consumer on production riot-proxy                          | Staging's own consumer key, quota 120 a minute (ADR-058)                                                             |
| `STATUS_TOKEN`               | ninjagoldfinch.lol (env var)                                          | Bearer token for `/api/status` (ADR-062)                                                                             |
| `DEPLOY_SSH_KEY`             | GitHub environments `prod` and `staging`, one key each                | Uploads and activates a release over SSH; forced to `ninja-deploy ninjagoldfinch-lol` on the host (ADR-053, ADR-057) |
| `admin-main`                 | riot-proxy consumer                                                   | Admin key used by riot-proxy's dashboard; never given to the site                                                    |
| `bootstrap-admin`            | riot-proxy consumer                                                   | Created on riot-proxy's first start with an empty key table                                                          |
| `RIOT_API_KEY`               | riot-proxy only                                                       | The Riot API key                                                                                                     |
| Onidel archive key           | riot-proxy (`ARCHIVE_OBJECT_ACCESS_KEY`, `ARCHIVE_OBJECT_SECRET_KEY`) | Read and write on Onidel `riot-proxy-archive`; also used by `rclone`                                                 |
| R2 archive token             | `rclone` on the production host                                       | Read and write on R2 `riot-proxy-archive` only                                                                       |
| R2 backups token             | riot-proxy's off-box backup job                                       | R2 `ngf-backups` only                                                                                                |
| Tunnel token                 | cloudflared (`/etc/cloudflared/token`)                                | Connects the production host to Cloudflare                                                                           |
| site deploy key              | `ninjagoldfinch-lol` user on the production host                      | Read-only GitHub deploy key for the fallback checkout (ADR-054)                                                      |

## Buckets and prefixes

None belong to ninjagoldfinch.lol. All are riot-proxy's.

| Store                 | Bucket               | Key scheme                                                                                        | Role             |
| --------------------- | -------------------- | ------------------------------------------------------------------------------------------------- | ---------------- |
| Onidel Object Storage | `riot-proxy-archive` | `packs/<matches\|timelines>/<yyyy>/<mm>/<ulid>.pack`, `index/<packs\|locations>-<date>.jsonl.zst` | System of record |
| Cloudflare R2         | `riot-proxy-archive` | Same, copied by hourly `rclone sync`                                                              | Replica          |
| Cloudflare R2         | `ngf-backups`        | `riot-proxy/…` (SQLite backups)                                                                   | Off-box backups  |

## Domain terms

| Term                          | Meaning                                                                                            |
| ----------------------------- | -------------------------------------------------------------------------------------------------- |
| Riot ID                       | `GameName#TAG`; written `GameName-TAG` in site URLs                                                |
| PUUID                         | Riot's permanent player id; used server-side only, never sent to the Browser                       |
| match ID                      | `<PLATFORM>_<number>`, e.g. `OC1_712351051`; its prefix names the platform                         |
| timeline                      | Riot's per-minute frames and events for one match                                                  |
| platform                      | Platform routing value, e.g. `oc1`, `euw1`                                                         |
| regional route                | Regional routing value: `americas`, `europe`, `asia`, `sea`                                        |
| region slug                   | The site's lower-case name for a platform, e.g. `oce`, `euw` (`src/lib/domain/regions.ts`)         |
| queue ID                      | Riot's numeric queue, e.g. 420 Ranked Solo/Duo; queue 0 is a custom game                           |
| patch                         | A game version's `major.minor`, e.g. `16.20`                                                       |
| Data Dragon version           | A full Data Dragon version, e.g. `16.20.1`; the "current patch" the site builds asset URLs for     |
| analytics                     | riot-proxy's champion statistics (`/v1/lol/analytics/*`), Ranked Solo/Duo only on this site        |
| set build                     | riot-proxy's aggregated build for a champion, role and slice                                       |
| matchup                       | A champion's results against one lane opponent                                                     |
| tier, tier range              | `?rank=diamond` (one tier, riot-proxy `tier`) or `?rank=diamond+` (that tier and above, `minTier`) |
| low sample                    | A rate from under 100 games (`LOW_SAMPLE_GAMES`)                                                   |
| refresh                       | The profile's POST action asking riot-proxy to re-read from Riot, once a minute per player         |
| fetched age                   | riot-proxy's seconds since it last read a part from Riot (`fetchedAgeSeconds`)                     |
| essential call, optional call | A riot-proxy call whose failure fails the page, or only degrades one section (`optional()`)        |
| budget                        | The deadline on a riot-proxy call: 5 s analytics and static, 30 s otherwise                        |
| edge cache                    | Cloudflare's cache of rendered pages, driven by the site's `Cache-Control`                         |

## Path and formatting conventions

- Site routes: `GET /summoner/{riotId}`; riot-proxy routes: `GET /v1/lol/matches/{region}/{matchId}`. Path parameters in braces, named as in the code or spec.
- Environment variables in code font, upper case: `PROXY_URL`.
- Dates: ISO `YYYY-MM-DD`. Durations: `30 s`, `5 min`.
- Source citations: `path/to/file.ts:L10-L42` in footers; inline as `src/lib/server/proxy.ts:74-78`. riot-proxy paths are prefixed `riot-proxy:` (e.g. `riot-proxy:src/config.rs:752-756`) and refer to the riot-proxy commit a document's Sources line names, else to `48f32aa`. Likewise `ninja-monitor:` and `ninja-actions:`.
- Unknowns: `> **TODO (unverified):** <what and where you looked>`, also listed in `_meta/gaps.md`.

---

**Sources:** `riot-proxy:docs/DECISIONS.md:L1512`, `src/lib/domain/regions.ts:L1-L50`, `src/lib/domain/champion-stats.ts:L13-L63`, `playwright.config.ts:L3-L31`, `src/lib/server/proxy.ts:L69-L78`, `riot-proxy:docs/DECISIONS.md:L1510`, `riot-proxy:deploy/README.md:L14-L36`, `riot-proxy:docs/design/12-object-storage-and-hosting.md:L805-L855`, `riot-proxy:docs/design/13-admin-dashboard.md:L55-L67`, `docs/PROGRESS.md` ("P5-05 check"), `ninja-monitor` at `v0.2.3`: `README.md:L1-L10`, `src/heartbeat.rs:L1-L28`
**Last verified:** 2026-11-03 against commit `2658c48`
