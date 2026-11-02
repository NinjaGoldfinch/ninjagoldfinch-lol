# Inventory

Factual discovery notes for ninjagoldfinch.lol, gathered at the start of documentation Pass A. Every row cites a file and line or a command that was run; the other documents are checked against this file.

Commit inspected: `e7c395c` on branch `docs/VS-exit-check` (clean tree), 2026-10-19.

## 1. Languages, runtimes and tooling

| Item                    | Value                                                                                             | Source                                                          |
| ----------------------- | ------------------------------------------------------------------------------------------------- | --------------------------------------------------------------- |
| Language                | TypeScript (strict), Svelte 5 components                                                          | `tsconfig.json:4`, `vite.config.ts:10-13`                       |
| Runtime                 | Node, `engines.node` `>=22.18`                                                                    | `package.json:6-8`                                              |
| Node on this box        | v22.23.3                                                                                          | `node --version`                                                |
| Package manager         | pnpm 12.10.1, pinned through `packageManager` (corepack)                                          | `package.json:5`, `pnpm --version`                              |
| Lockfile                | `pnpm-lock.yaml` (pnpm's own version kept out of it)                                              | `pnpm-workspace.yaml:3-8`, `docs/DECISIONS.md:57-65`            |
| Framework               | SvelteKit 3.0.1 (installed), `@sveltejs/adapter-node` 6.0.0                                       | `node_modules/@sveltejs/kit/package.json`, `package.json:23-24` |
| UI                      | Svelte 5.57.2, Tailwind CSS 4.3.3                                                                 | `node_modules/*/package.json`                                   |
| Build                   | Vite 8.3.3                                                                                        | `node_modules/vite/package.json`                                |
| Only runtime dependency | `openapi-fetch` 0.17.0                                                                            | `package.json:50-52`                                            |
| Type generation         | `openapi-typescript` ^7.13.0 (dev)                                                                | `package.json:32`, `justfile:16-17`                             |
| Tests                   | Vitest 4.1.11 (unit), Playwright 1.64.0 (e2e)                                                     | `package.json:20-21`                                            |
| Lint and format         | ESLint 10 + typescript-eslint + eslint-plugin-svelte; Prettier 3 with svelte and tailwind plugins | `eslint.config.js`, `prettier.config.js`                        |
| Task runner             | just 1.58.0 on this box                                                                           | `justfile`, `just --version`                                    |
| Docs note               | README says Node 22.17 or later; `package.json` says `>=22.18`; ADR-038 says 22.18                | `README.md:12`, `package.json:7`, `docs/DECISIONS.md:513`       |

## 2. Directory tree (tracked files, depth 3)

| Path                  | Purpose                                                                                          |
| --------------------- | ------------------------------------------------------------------------------------------------ |
| `.githooks/`          | `pre-commit` (refuses commits on `main` and key-like strings), `pre-push` (runs `just check`)    |
| `.vscode/`            | Editor recommendations                                                                           |
| `deploy/`             | `compose.yaml` for the LAN preview VM                                                            |
| `deploy/proxmox/`     | `create-vm.sh`, `ninjagoldfinch-update`, `test.sh`, README for the Proxmox preview VM            |
| `docs/`               | `IMPLEMENTATION.md` (plan), `DECISIONS.md` (ADR-001…043), `PROGRESS.md`                          |
| `docs/notes/`         | `VS-plan.md`, `match-layouts.md` and its screenshots in `match-layouts/`                         |
| `openapi/`            | `riot-proxy.json`, the committed riot-proxy OpenAPI spec (v2.7.0)                                |
| `src/`                | `app.html`, `app.css`, `app.d.ts`, `env.ts` (env declarations), `hooks.server.ts`                |
| `src/lib/api/`        | `schema.d.ts` (generated), hand-typed parsers `match.ts`, `ddragon.ts`, `cdragon.ts`, `riot.ts`  |
| `src/lib/assets/`     | `favicon.svg`                                                                                    |
| `src/lib/components/` | 19 Svelte components                                                                             |
| `src/lib/domain/`     | 15 pure modules (each with a unit test)                                                          |
| `src/lib/server/`     | Server-only: proxy client, env rules, errors, cache policies, loaders, in-memory lookups         |
| `src/routes/`         | Pages and endpoints (section 4)                                                                  |
| `static/`             | `robots.txt`                                                                                     |
| `tests/unit/`         | 34 Vitest files                                                                                  |
| `tests/e2e/`          | 5 Playwright files                                                                               |
| `tests/fixtures/`     | 54 recorded or synthetic riot-proxy responses; `builds/` holds riot-proxy's golden build fixture |
| `tests/mock-proxy/`   | Mock riot-proxy replaying fixtures                                                               |
| `tests/` (files)      | `record-fixture.ts`, `redact.ts`                                                                 |

Untracked build artefacts present on disk: `build/`, `.svelte-kit/`, `node_modules/`, `test-results/` (all in `.gitignore:1-25`).

## 3. Entry points

| Entry point                              | What it is                                        | Source                                      |
| ---------------------------------------- | ------------------------------------------------- | ------------------------------------------- |
| `node build`                             | Production server (adapter-node output)           | `Dockerfile:23`, `README.md:92`             |
| `pnpm dev` / `just dev`                  | Vite dev server                                   | `package.json:10`, `justfile:12-13`         |
| `node tests/mock-proxy/server.ts [port]` | Mock riot-proxy, default port 8787                | `tests/mock-proxy/server.ts:1-12`           |
| `node tests/record-fixture.ts`           | Fixture recorder (`just fixture`)                 | `tests/record-fixture.ts`, `justfile:35-36` |
| `deploy/proxmox/create-vm.sh`            | Creates the preview VM on a Proxmox host          | `deploy/proxmox/create-vm.sh`               |
| `ninjagoldfinch-update [ref]`            | Deploys a ref on the preview VM                   | `deploy/proxmox/ninjagoldfinch-update`      |
| `src/hooks.server.ts`                    | `handle` (central cache policy) and `handleError` | `src/hooks.server.ts:5-20`                  |

No cron jobs, background workers, crawlers or queues exist in this repo (searched `src/`, `tests/`, `deploy/` for scheduling and storage terms; none found).

## 4. HTTP routes (master list)

Probed with the production build (`node build`) against the mock proxy on port 4173, 2026-10-19.

| Method | Path                                  | File:line                                               | Behaviour / Cache-Control observed                                             |
| ------ | ------------------------------------- | ------------------------------------------------------- | ------------------------------------------------------------------------------ |
| GET    | `/`                                   | `src/routes/+page.svelte` (no load)                     | 200, no `cache-control` header                                                 |
| GET    | `/about`                              | `src/routes/about/+page.ts:2` (prerendered)             | 200 static file, no `cache-control`                                            |
| GET    | `/healthz`                            | `src/routes/healthz/+server.ts:6`                       | 200 `{"ok":true}`, `no-store`                                                  |
| GET    | `/search`                             | `src/routes/search/+page.server.ts:18-47`               | 200 or 303 to a profile or champion page; `no-store`                           |
| GET    | `/summoner/{riotId}`                  | `src/routes/summoner/[riotId]/+page.server.ts:14-28`    | 200 `public, s-maxage=60, stale-while-revalidate=300`; 307 to clean query; 404 |
| POST   | `/summoner/{riotId}?/refresh`         | `src/routes/summoner/[riotId]/+page.server.ts:30-38`    | Form action; `no-store`; cross-origin POST 403                                 |
| GET    | `/summoner/{region}/{riotId}`         | `src/routes/summoner/[region]/[riotId]/+server.ts:9-13` | 308 to `/summoner/{riotId}`                                                    |
| GET    | `/match/{matchId}`                    | `src/routes/match/[matchId]/+page.server.ts:7-17`       | 200 `public, s-maxage=86400, stale-while-revalidate=86400`; 404                |
| GET    | `/match/{region}/{matchId}`           | `src/routes/match/[region]/[matchId]/+server.ts:8-11`   | 308 to `/match/{matchId}`                                                      |
| GET    | `/champions`                          | `src/routes/champions/+page.server.ts:7-19`             | 200 `public, s-maxage=600, stale-while-revalidate=600`; 307 to clean query     |
| GET    | `/champions/{key}`                    | `src/routes/champions/[key]/+page.server.ts:9-28`       | 200 analytics policy; 308 to canonical slug and query                          |
| GET    | `{page}/__data.json`                  | SvelteKit (client navigation data)                      | Same cache policy as the page (observed on the profile)                        |
| GET    | `/robots.txt`, `/favicon…`, `/_app/*` | `static/`, build output                                 | Static                                                                         |
| any    | unknown path                          | SvelteKit                                               | 404 `public, s-maxage=60` (set by `src/hooks.server.ts:5-10`)                  |

No JSON API, RPC, websocket or queue consumer. `/healthz` is the only non-HTML endpoint written by hand.

## 5. Outbound network calls

| Target                        | Call                                                                                      | Auth                                         | Timeout / retry                                              | Source                                                                         |
| ----------------------------- | ----------------------------------------------------------------------------------------- | -------------------------------------------- | ------------------------------------------------------------ | ------------------------------------------------------------------------------ |
| riot-proxy `PROXY_URL`        | `GET /v1/players/by-riot-id/{gameName}/{tagLine}/profile[?refresh=true]`                  | `Authorization: Bearer <PROXY_KEY>` when set | 30 s, no retry                                               | `src/lib/server/profile.ts:78-80`, `src/lib/server/proxy.ts:73-77,146`         |
| riot-proxy                    | `GET /v1/players/{puuid}/matches?platform&start&count&queue&champion&refresh`             | same                                         | 30 s, optional                                               | `src/lib/server/profile.ts:89-104`                                             |
| riot-proxy                    | `GET /v1/lol/matches/{region}/{matchId}`                                                  | same                                         | 30 s, essential                                              | `src/lib/server/match.ts:38`                                                   |
| riot-proxy                    | `GET /v1/lol/matches/{region}/{matchId}/timeline`                                         | same                                         | 30 s, optional                                               | `src/lib/server/match.ts:39`                                                   |
| riot-proxy                    | `GET /v1/static/versions`                                                                 | same                                         | 5 s; held 5 min in memory                                    | `src/lib/server/patch.ts:48-85`                                                |
| riot-proxy                    | `GET /v1/static/{champion,item,summoner,runesReforged}?version=`, `GET /v1/static/queues` | same                                         | 5 s; held per patch in memory                                | `src/lib/server/static-data.ts:27-64`                                          |
| riot-proxy                    | `GET /v1/lol/analytics/champions`                                                         | same                                         | 5 s, essential                                               | `src/lib/server/champions.ts:38`                                               |
| riot-proxy                    | `GET /v1/lol/analytics/patches[?championId=]`                                             | same                                         | 5 s, optional                                                | `src/lib/server/champions.ts:39-41`, `src/lib/server/champion-page.ts:135-139` |
| riot-proxy                    | `GET /v1/lol/analytics/champions/{championId}` (+`/builds`, `/matchups`)                  | same                                         | 5 s; detail essential, builds and matchups optional          | `src/lib/server/champion-page.ts:121-140`                                      |
| CommunityDragon `CDRAGON_URL` | `GET {base}/{major.minor}/plugins/rcp-be-lol-game-data/global/default/v1/perks.json`      | none                                         | 5 s (`CDRAGON_BUDGET_MS`); held per patch; failure tolerated | `src/lib/server/cdragon.ts:11-39`, `src/lib/assets.ts:47-49`                   |
| Browser → Data Dragon CDN     | Image URLs `https://ddragon.leagueoflegends.com/cdn/...`                                  | none                                         | n/a (browser)                                                | `src/lib/assets.ts:7-33`                                                       |
| Browser → CommunityDragon     | Lane and stat shard icons `https://raw.communitydragon.org/...`                           | none                                         | n/a (browser)                                                | `src/lib/assets.ts:8,39-71`                                                    |

Not present: calls to Riot, to ninja-monitor, to any database, cache server, object store or webhook (grep for `s3`, `r2`, `bucket`, `onidel`, `redis`, `sqlite`, `postgres`, `monitor`, `metrics` across `src/ tests/ deploy/` returned nothing relevant).

Logging on failures: `proxy <status> <method> <path> request-id=<X-Request-Id>` for a non-2xx response (`src/lib/server/proxy.ts:6-19`); `proxy timeout <method> <path> after <ms> ms` and `proxy unreachable ...` for a call that got no response, both then a 503 (`src/lib/server/proxy.ts:124-128`); `proxy slow ... x-cache=... <ms>ms` over 250 ms for analytics (`src/lib/server/proxy.ts:36-66`).

## 6. Persistence

| Store                  | What                                          | Lifetime                | Source                                                    |
| ---------------------- | --------------------------------------------- | ----------------------- | --------------------------------------------------------- |
| Process memory         | Current patch and Data Dragon version list    | 5 min (`PATCH_TTL_MS`)  | `src/lib/server/patch.ts:48-68`                           |
| Process memory         | Reduced Data Dragon lookups for one patch     | Until the patch changes | `src/lib/server/static-data.ts:24-39`                     |
| Process memory         | CommunityDragon stat shards for one patch     | Until the patch changes | `src/lib/server/cdragon.ts:9-39`                          |
| Process memory         | Per-request start times for slow-call logging | One request             | `src/lib/server/proxy.ts:39`                              |
| Browser `localStorage` | `recent-searches` (Riot IDs, up to eight)     | Visitor-controlled      | `src/lib/recent-storage.ts:6-22`, `docs/DECISIONS.md:100` |
| Edge (Cloudflare)      | Rendered pages per `Cache-Control`            | Policy table            | `src/lib/server/cache.ts:5-16`                            |

No database, migrations, on-disk files, Redis or object storage in this repo.

## 7. Configuration surface

| Name                                                                                                                                                                                                                               | Read by / where                                                                                                                                                                                                                                                            | Default                                                             | Required                         |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- | -------------------------------- |
| `PROXY_URL`                                                                                                                                                                                                                        | `src/env.ts:13-16`, `src/lib/server/env.ts:10-15`                                                                                                                                                                                                                          | none                                                                | Yes, at start-up                 |
| `PROXY_KEY` (secret)                                                                                                                                                                                                               | `src/env.ts:27-30`, `src/lib/server/env.ts:47-55`                                                                                                                                                                                                                          | unset                                                               | When `NODE_ENV=production`       |
| `CDRAGON_URL`                                                                                                                                                                                                                      | `src/env.ts:23-26`, `src/lib/server/env.ts:17-25`                                                                                                                                                                                                                          | `https://raw.communitydragon.org`                                   | No                               |
| `PUBLIC_SITE_NAME`                                                                                                                                                                                                                 | `src/env.ts:17-22`, `src/lib/legal.ts:1-4`                                                                                                                                                                                                                                 | `ninjagoldfinch.lol`                                                | No (public, static)              |
| `NODE_ENV`                                                                                                                                                                                                                         | `src/env.ts:29`; set in `Dockerfile:16`                                                                                                                                                                                                                                    | unset                                                               | `production` in production       |
| `ORIGIN` (build time)                                                                                                                                                                                                              | `vite.config.ts:16-19`; Docker build arg `Dockerfile:9-11`                                                                                                                                                                                                                 | none (origin from Host header)                                      | For form posts in production     |
| `HOST`                                                                                                                                                                                                                             | adapter-node, `build/server/adapter-index.js:9` (build output)                                                                                                                                                                                                             | `0.0.0.0`                                                           | No                               |
| `PORT`                                                                                                                                                                                                                             | adapter-node, `build/server/adapter-index.js:10`                                                                                                                                                                                                                           | `3000`                                                              | No                               |
| `SOCKET_PATH`, `XFF_DEPTH`, `ADDRESS_HEADER`, `PROTOCOL_HEADER`, `HOST_HEADER`, `PORT_HEADER`, `BODY_SIZE_LIMIT`, `SHUTDOWN_TIMEOUT` (30), `IDLE_TIMEOUT` (0), `KEEP_ALIVE_TIMEOUT`, `HEADERS_TIMEOUT`, `LISTEN_PID`, `LISTEN_FDS` | adapter-node, `build/server/adapter-node-env.js:4-19`                                                                                                                                                                                                                      | adapter defaults                                                    | No; none set by this repo        |
| `COREPACK_ENABLE_DOWNLOAD_PROMPT`                                                                                                                                                                                                  | `Dockerfile:4` (preview image build only)                                                                                                                                                                                                                                  | `0` in the image                                                    | No                               |
| `NINJAGOLDFINCH_REPO`, `NINJAGOLDFINCH_DIR`, `NINJAGOLDFINCH_DEPLOY_KEY`                                                                                                                                                           | `deploy/proxmox/ninjagoldfinch-update:12-14`                                                                                                                                                                                                                               | repo SSH URL, `/opt/ninjagoldfinch`, `~/.ssh/ninjagoldfinch-deploy` | No                               |
| `create-vm.sh` flags                                                                                                                                                                                                               | `deploy/proxmox/create-vm.sh:38-85`: `--ssh-keys`, `--generate-key`, `--key-dir`, `--vmid`, `--name`, `--storage`, `--snippets`, `--bridge`, `--cores` (2), `--memory` (2048), `--disk` (16G), `--ip`, `--gw`, `--user`, `--image-dir`, `--dry-run`, `--print-vendor-data` | as listed                                                           | `--ssh-keys` or `--generate-key` |

Files: `.env` (local, from `.env.example`), `deploy/.env` (preview VM, `deploy/compose.yaml:13`), `/etc/ninjagoldfinch-lol/env` (production, `README.md:98`; not in the repo).

## 8. CI/CD

- No `.github/` directory; no GitHub Actions. CLAUDE.md forbids adding any (`CLAUDE.md:11-12`).
- Local gate: `.githooks/pre-push` runs `just check` (`.githooks/pre-push:1-3`).
- `.githooks/pre-commit` refuses commits on `main` and added lines matching `(rpx_|RGAPI-)[A-Za-z0-9_-]` (`.githooks/pre-commit:1-27`, ADR-002).
- Deploys are manual: production per `README.md:103-113`; preview VM per `deploy/proxmox/README.md:91-99`.

## 9. Build, test, release and deploy tooling

| Tool                                         | Location                   | Notes                                                                                                                     |
| -------------------------------------------- | -------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| `just setup/dev/gen/check/e2e/fixture/image` | `justfile:1-40`            | `check` runs prettier, schema drift check, eslint, svelte-kit sync, svelte-check, vitest, build, `deploy/proxmox/test.sh` |
| `Dockerfile`                                 | `Dockerfile:1-23`          | Two-stage `node:22-alpine`; `HEALTHCHECK` on `/healthz`; used by the preview VM only                                      |
| `deploy/compose.yaml`                        | `deploy/compose.yaml:1-14` | One `web` service, port 3000                                                                                              |
| Proxmox scripts                              | `deploy/proxmox/`          | Debian 13 VM, Docker, deploy key, `ninjagoldfinch-update`                                                                 |
| systemd unit                                 | not in repo                | `ninjagoldfinch-lol.service` described in `README.md:97` and ADR-038                                                      |
| Reverse proxy                                | not in repo                | Cloudflare Tunnel to `127.0.0.1:3000` (ADR-038, `README.md:92-99`); no Caddy/nginx config                                 |

## 10. Existing documentation

| File                              | Status                                                                                            |
| --------------------------------- | ------------------------------------------------------------------------------------------------- |
| `README.md`                       | Current; production deploy and spec refresh steps                                                 |
| `CLAUDE.md`                       | Working rules                                                                                     |
| `docs/IMPLEMENTATION.md`          | Plan of 2026-10-09; its architecture, compose and deployment sections predate ADR-038 and ADR-037 |
| `docs/DECISIONS.md`               | ADR-001 to ADR-043, the main evidence for design decisions                                        |
| `docs/PROGRESS.md`                | Task ticks and phase exit checks; SPD-06 and P5 open                                              |
| `deploy/proxmox/README.md`        | Preview VM procedure; still names the dev proxy `http://192.168.68.46:8080` (line 3)              |
| `tests/fixtures/builds/README.md` | Provenance of riot-proxy's golden build fixture                                                   |
| `docs/notes/*.md`                 | Design notes (VS plan, match layouts)                                                             |

## 11. Tests

Run on 2026-10-19 at `e7c395c`:

```text
$ just check
  prettier --check .        All matched files use Prettier code style!
  svelte-check              473 FILES 0 ERRORS 0 WARNINGS
  vitest run                Test Files 34 passed (34), Tests 332 passed (332)
  build                     done (adapter-node)
  deploy/proxmox/test.sh    deploy test: ok
exit 0

$ just e2e
  81 passed (25.9s)
```

E2E files: `routes.test.ts`, `match.test.ts`, `champion-page.test.ts`, `champions.test.ts`, `layout.test.ts`. Playwright runs `node build` against the mock proxy on port 8787 (`playwright.config.ts:3-31`).

`prettier --check .` covers Markdown under `docs/` except `docs/IMPLEMENTATION.md` (`.prettierignore:12-14`), so new docs must be Prettier-formatted.

## 12. Git history

- 70 commits on `HEAD`; first `6dc9048` 2026-10-09 (scaffold), latest `e7c395c` (VS exit check).
- Tags: `phase-P0` … `phase-P4`. No `vX.Y.Z` release tags.
- `git shortlog -sn`: Samuel Goldfinch 68, NinjaGoldfinch 2.
- Work series: P0–P4 (2026-10-09/10), SPD (2026-10-14/15), VS and FIX (2026-10-19). PRs #1–#68, squash-merged.

## 13. riot-proxy side of the boundary

Read from `../riot-proxy` (shallow clone at `48f32aa`, 2026-10-19; `Cargo.toml:3` version `2.7.0`; latest remote tag `v2.7.0`). Paths below are relative to that repo. Key claims were re-opened and confirmed: `docs/DECISIONS.md:1510`, `src/config.rs:658-662`, `deploy/README.md:14-36`, `docs/design/12-object-storage-and-hosting.md:525-535,595-632,800-838`, `src/http/error.rs:13-25`, `.github/workflows/`.

### Production host

- Onidel ONI-4, Sydney, `ngf-prod-syd1`: 6 vCPU, 12 GB RAM, 120 GB NVMe, 6 TB, Ubuntu 26.04 LTS. Runs riot-proxy, ninjagoldfinch.lol and `cloudflared`; only SSH listens publicly (`docs/DECISIONS.md:1510`, ADR-142). This supersedes the "2 vCPU, 4 GB" server in this repo's ADR-038 (`docs/DECISIONS.md:504`).
- Site: `ninjagoldfinch-lol.service` (`node build`) on `127.0.0.1:3000`, settings `/etc/ninjagoldfinch-lol/env`, unit copied from the previous server and not kept in either repo (`docs/design/12-object-storage-and-hosting.md:531-535,620-627`).
- `PROXY_URL=http://127.0.0.1:8080` (same box) (`docs/design/12-object-storage-and-hosting.md:630`).
- Install notes for the site on the new box: `nodejs`, `git`; system user `ninjagoldfinch-lol` with home `/opt/ninjagoldfinch-lol-home`; pnpm 12.10.1 from `npm install -g` because Ubuntu's `node-corepack` 0.24 cannot load pnpm 12 (`docs/design/12-object-storage-and-hosting.md:612-615,802-806`).
- Cloudflare Tunnel: `cloudflared` system service, `--token-file /etc/cloudflared/token`; routes `ninjagoldfinch.lol` → `:3000`, `api.ninjagoldfinch.lol` → `:8080` (WAF blocks `/metrics`, `/dashboard*`, `/dev*`, `/v1/admin*`), `admin.ninjagoldfinch.lol` → `:8080` behind Cloudflare Access (`docs/design/13-admin-dashboard.md:55-67`, `docs/design/12-object-storage-and-hosting.md:805,904-917`).
- ninja-monitor on the box watches `riot-proxy`, `ninjagoldfinch-lol` and `cloudflared` (memory limits 2 GiB, 1 GiB, 512 MiB; down after 30 s; disk 70 % and 85 %; host memory under 15 %; CPU over 90 % for 20 min), posting to Discord (`docs/design/12-object-storage-and-hosting.md:832-838`). Not code in either repo.

### Auth and consumer keys

- Key format `rpx_` + base64url of 24 bytes; sent as `Authorization: Bearer`, with `?token=` as a fallback (`src/consumers.rs:12,95-103`, `src/http/auth.rs:141-156`).
- Stored as SHA-256 in SQLite table `consumers`, default `quota_per_min` 600 (`src/db/migrations/V0001__init.sql:5-13`, `src/consumers.rs:105-107`).
- Scopes `read` and `admin` (`src/consumers.rs:18-36`). Create `riot-proxy key create --name <n> [--scopes] [--quota]`, list, revoke (soft) (`src/cli/key.rs:11-79`, `src/consumers.rs:228-251`). No rotate command.
- Quota: in-memory 60 s sliding window; `X-RateLimit-Limit/Remaining/Reset`; over quota `QUOTA_EXCEEDED` 429 with `Retry-After`; resets on restart (`src/http/quota.rs:1-135`).
- `AUTH_DISABLED=true` runs requests as `dev-local` (read+admin, quota 100,000); refused when `ENV=production` (`src/http/auth.rs:8-9,43-52`, `src/config.rs:658-662`).
- Key names: `admin-main` appears once (`docs/design/12-object-storage-and-hosting.md:855`). `ninjagoldfinch-lol-prod` and `ninjagoldfinch-web` appear nowhere in riot-proxy; `ninjagoldfinch-web` is the name this repo suggests (`docs/IMPLEMENTATION.md:187`, `deploy/proxmox/README.md:69`).

### Routes the site calls

| Route                                                     | riot-proxy source                                         | Calls Riot                                       | Cache notes                                                                                        |
| --------------------------------------------------------- | --------------------------------------------------------- | ------------------------------------------------ | -------------------------------------------------------------------------------------------------- |
| `GET /v1/players/by-riot-id/{gameName}/{tagLine}/profile` | `src/routes/players.rs:54,422-477`                        | Yes (account, region, summoner, league, mastery) | `refresh` once per 60 s per player and part; TTLs account 86,400 s, summoner 3,600 s, league 300 s |
| `GET /v1/players/{puuid}/matches`                         | `src/routes/players.rs:55,601-804`                        | Yes (id list 120 s soft TTL, unarchived matches) | `platform` required; `count` 1–20                                                                  |
| `GET /v1/lol/matches/{region}/{matchId}[/timeline]`       | `src/routes/lol.rs:37-38,266-299`                         | On first fetch, then archived                    | `X-Cache: ARCHIVE`; prefix must match region else `BAD_REGION`                                     |
| `GET /v1/static/versions`, `/queues`, `/{file}`           | `src/routes/statics.rs:55-60`                             | No (Data Dragon mirror)                          | `X-Cache: HIT`                                                                                     |
| `GET /v1/lol/analytics/...`                               | `src/routes/analytics.rs:58-64`                           | No                                               | In-memory LRU (`ANALYTICS_CACHE_ENTRIES` 512), `Cache-Control: private, max-age=300`, ETag         |
| `GET /healthz`, `/readyz`, `/metrics`                     | `src/routes/health.rs:21-106`, `src/telemetry.rs:101-121` | No                                               | `/metrics` has no auth                                                                             |

Error envelope `{"error":{"code","message","requestId?","retryAfter?"}}`; codes UNAUTHORIZED 401, FORBIDDEN 403, QUOTA_EXCEEDED 429, NOT_FOUND 404, UPSTREAM_ERROR 502, RATE_LIMITED 503, BAD_REGION 400, VALIDATION 400, INTERNAL 500 (`src/http/error.rs:13-25,55-67,140-193`). `X-Request-Id` on every response (`src/http/request_id.rs:49-66`).

Riot client: 25 s per request, 10 s connect; 5xx retried twice (250 ms, 750 ms); interactive wait for the limiter up to `CLIENT_WAIT_BUDGET_MS` 2000 (`src/riot/client.rs:19-24`, `src/fetcher.rs:9-44`, `src/config.rs:716`).

### Object storage (riot-proxy only)

- `object_store` crate, S3-compatible (`Cargo.toml:26-28`). Primary Onidel bucket `riot-proxy-archive` at `https://s3.ap-southeast-2.onidel.cloud`; Cloudflare R2 `riot-proxy-archive` is an hourly `rclone sync` replica the proxy never reads (`deploy/README.md:14-36`, `deploy/riot-proxy-replica.{service,timer}`).
- Keys `packs/<matches|timelines>/<yyyy>/<mm>/<ulid>.pack`, `index/packs-<date>.jsonl.zst`, `index/locations-<date>.jsonl.zst` (`src/archive/pack.rs:124-133`, `src/archive/recovery.rs:5-8`).
- Lifecycle: `index/` 14 days (Onidel), 21 days (R2); R2 multipart abort 1 day; `packs/` kept (`deploy/README.md:31-36`).
- Backups: `riot-proxy-offsite.timer` copies SQLite backups to R2 bucket `ngf-backups`, prefix `riot-proxy/`, 14-day expiry; not in the repo (`docs/design/12-object-storage-and-hosting.md:810-820`).
- ninjagoldfinch.lol reads and writes no bucket.

### CI/CD

`.github/workflows/ci.yml` (push to `main`, PRs; no secrets; publishes nothing), `edge.yml` (pushes `ghcr.io/ninjagoldfinch/riot-proxy:edge`, `GITHUB_TOKEN`), `release.yml` (`v*` tags; binaries, `sha256sums`, multi-arch image; `GITHUB_TOKEN`). The site's spec refresh downloads `riot-proxy-linux-amd64` and `sha256sums` from a release (`README.md:58-64` in this repo).

### Discrepancies noted

- `.env.example:34` vs `src/config.rs:111` on the `JOB_KIND_LIMITS` default.
- `deploy/proxmox/README.md:3` (this repo) still names `http://192.168.68.46:8080`; ADR-039 says the LAN dev instance is gone.

## 14. Owner-supplied evidence (not in any repo)

### `systemctl cat ninjagoldfinch-lol` on `ngf-prod-syd1`, pasted by the owner 2026-10-19

```ini
# /etc/systemd/system/ninjagoldfinch-lol.service
[Unit]
Description=ninjagoldfinch.lol website
After=network-online.target riot-proxy.service
Wants=network-online.target

[Service]
User=ninjagoldfinch-lol
EnvironmentFile=/etc/ninjagoldfinch-lol/env
WorkingDirectory=/opt/ninjagoldfinch-lol
ExecStart=/usr/bin/node build
Restart=always
RestartSec=2
ProtectSystem=strict
PrivateTmp=yes
NoNewPrivileges=yes

[Install]
WantedBy=multi-user.target
```

Cited elsewhere as `owner:systemctl-cat-2026-10-19`.

### Variable names in `/etc/ninjagoldfinch-lol/env`, pasted by the owner 2026-10-19 (names only)

`NODE_ENV`, `HOST`, `PORT`, `PROXY_URL`, `PROXY_KEY`. This matches `README.md:98`. `CDRAGON_URL` and `PUBLIC_SITE_NAME` are not set, so their defaults apply (`src/lib/server/env.ts:17-25`, `src/env.ts:17-22`); `ORIGIN` is given only on the build command (`README.md:109-113`). Values are not recorded; `HOST` is `127.0.0.1` per ADR-038 (`docs/DECISIONS.md:509`).

### Owner answers, 2026-10-19

- Production consumer key name: `ninjagoldfinch-lol-prod`.
- The Proxmox preview VM no longer exists; it may be recreated.
- Keep `docs/api/openapi.yaml`; omit `data/schema.md` and `data/migrations.md`.
