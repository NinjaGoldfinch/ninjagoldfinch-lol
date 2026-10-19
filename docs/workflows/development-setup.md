# Development setup

From a clean machine to passing tests and a local ninjagoldfinch.lol rendering pages, either against the mock proxy or against a riot-proxy you run yourself. Every step below was run on 2026-10-20; nothing here needs the dormant LAN dev proxy.

## What you need

| Tool                  | Version                                  | Why                                     | Source                                           |
| --------------------- | ---------------------------------------- | --------------------------------------- | ------------------------------------------------ |
| Node                  | 22.18 or later (`engines.node >=22.18`)  | Runs Vite, the tests and `node build`   | `package.json:6-8`, `.npmrc:1` (`engine-strict`) |
| pnpm                  | 12.10.1 exactly (`packageManager`)       | Installs from `pnpm-lock.yaml`          | `package.json:5`                                 |
| just                  | any recent (1.58.0 used here)            | Task runner for every command           | `justfile`                                       |
| git                   | any                                      | `just setup` sets `core.hooksPath`      | `justfile:6-9`                                   |
| Playwright's Chromium | the one `@playwright/test` asks for      | `just e2e` only                         | `README.md:16-17`                                |
| riot-proxy            | optional; release `v2.7.0` matches specs | Only to see live data instead of mocked | `openapi/riot-proxy.json`, `README.md:55-66`     |

`README.md:12` says "Node 22.17 or later"; `package.json:7` says `>=22.18`, and `.npmrc` sets `engine-strict=true`, so `package.json` wins.

**pnpm.** `corepack enable` provides the pinned pnpm on most systems (`README.md:13`). On Ubuntu 26.04 the packaged `node-corepack` (0.24) cannot load pnpm 12, so install it directly instead: `npm install -g pnpm@12.10.1` (`riot-proxy:docs/design/12-object-storage-and-hosting.md:802-806`).

## 1. Clone and install

1. Clone the private repo (you need read access):

   ```sh
   git clone git@github.com:NinjaGoldfinch/ninjagoldfinch-lol.git
   cd ninjagoldfinch-lol
   ```

2. Run the first-time setup:

   ```sh
   just setup
   ```

   This runs `pnpm install`, `git config core.hooksPath .githooks`, and copies `.env.example` to `.env` if there is no `.env` yet (`justfile:5-9`). `.env` is git-ignored (`.gitignore:16-18`).

3. Check that the hooks are active:

   ```sh
   git config core.hooksPath   # prints .githooks
   ```

   `pre-commit` refuses commits on `main` and staged lines that look like a key; `pre-push` runs `just check` (`.githooks/pre-commit:4-23`, `.githooks/pre-push:1-3`).

## 2. Run the gate

```sh
just check
```

This is the only gate; there is no CI (`CLAUDE.md:11-12`). It runs, in order: `prettier --check .`, a drift check of `src/lib/api/schema.d.ts` against `openapi/riot-proxy.json`, ESLint, `svelte-kit sync`, `svelte-check`, Vitest, `vite build`, and `deploy/proxmox/test.sh` (`justfile:19-28`). On a fresh clone at `e7c395c` it passed (exit 0); the suite has 34 test files and 332 tests. One test is flaky under load; see [testing.md](./testing.md#known-flaky-test).

Do not run `just check` (or push) from a linked `git worktree`: `deploy/proxmox/test.sh` runs `git init/commit/tag` in a temporary directory, and inside a hook in a worktree git exports `GIT_DIR`, so those commands land in the real repository. A separate full clone is safe.

## 3. Browser tests (optional)

1. Install Chromium and its system packages once per machine (`README.md:16-17`):

   ```sh
   pnpm exec playwright install chromium
   sudo "$(command -v pnpm)" exec playwright install-deps chromium
   ```

   Without the system fonts Chromium lays out text at zero height and visibility checks fail.

2. Run the tests:

   ```sh
   just e2e
   ```

   Playwright builds the site, starts `node build` on `http://localhost:4173` with `NODE_ENV=production`, and points it at the mock proxy on port 8787 (`playwright.config.ts:3-31`). Nothing reaches riot-proxy or Riot. See [testing.md](./testing.md).

## 4. Run the site locally

`PROXY_URL` is required at start-up in every environment (`src/lib/server/env.ts:10-15`); `PROXY_KEY` is optional unless `NODE_ENV=production` (`src/lib/server/env.ts:47-55`). Choose one of the two back ends below. The dev server loads its variables once, at start-up, with Vite's `loadEnv`, where variables already in the process environment win over `.env` (`node_modules/@sveltejs/kit/src/exports/vite/dev/index.js:295`). Both runs below started with the URL given on the command line.

For anything longer than a quick check, put `PROXY_URL` (and `CDRAGON_URL` if needed) in `.env` instead. On 2026-10-20 a dev server started with `PROXY_URL` on the command line was found, about 20 minutes and many reloads later, calling the `PROXY_URL` from `.env` instead (`ECONNREFUSED 192.168.68.46:8080`, the dormant LAN dev proxy). Running `svelte-kit sync`, `vitest`, `pnpm build` or a second dev server in the same checkout did not reproduce it.

> **TODO (unverified):** What makes a running dev server switch from a command-line `PROXY_URL` to the one in `.env`. Seen once, not reproduced; look at how SvelteKit's dev server re-imports `.svelte-kit/generated/dev/env/config.js` on a program reload.

### Option A: against the mock proxy (no riot-proxy, no Riot key)

The mock proxy replays `tests/fixtures/` and answers 500 for anything it has no fixture for (`tests/mock-proxy/mock.ts:27-48`). Only the recorded players, matches and champions render.

1. Start the mock in one terminal:

   ```sh
   node tests/mock-proxy/server.ts 8787
   # mock-proxy: 50 fixtures on http://127.0.0.1:8787
   ```

2. Start the dev server in another, pointing both riot-proxy and CommunityDragon at the mock:

   ```sh
   PROXY_URL=http://127.0.0.1:8787 CDRAGON_URL=http://127.0.0.1:8787 PROXY_KEY= just dev
   ```

3. Open these recorded pages; each answered 200 on 2026-10-20:
   - `http://localhost:5173/summoner/NinjaGoldfinch-OCENZ`
   - `http://localhost:5173/match/OC1_712351051`
   - `http://localhost:5173/champions`
   - `http://localhost:5173/champions/ahri`

### Option B: against a riot-proxy you run yourself

This is the replacement for the dormant LAN dev proxy (see [integration/environments.md](../integration/environments.md)). riot-proxy is a single static binary that keeps its state in a SQLite file under `DATA_DIR` (`riot-proxy:README.md:1-25`).

1. Download the release the committed spec was taken from and verify it:

   ```sh
   mkdir -p ~/riot-proxy-local && cd ~/riot-proxy-local
   v=2.7.0
   curl -fsSLO https://github.com/NinjaGoldfinch/riot-proxy/releases/download/v$v/riot-proxy-linux-amd64
   curl -fsSLO https://github.com/NinjaGoldfinch/riot-proxy/releases/download/v$v/sha256sums
   sha256sum --ignore-missing -c sha256sums      # riot-proxy-linux-amd64: OK
   chmod +x riot-proxy-linux-amd64
   ```

   On Apple silicon use `riot-proxy-darwin-arm64` (`riot-proxy:README.md:11-13`).

2. Start it with auth off, bound to loopback:

   ```sh
   RIOT_API_KEY=<your Riot development key> AUTH_DISABLED=true \
   HOST=127.0.0.1 PORT=8080 DATA_DIR=./data \
   ./riot-proxy-linux-amd64 serve
   ```

   - `RIOT_API_KEY` is required and must be at least 8 characters (`riot-proxy:src/config.rs:610-613`). Without a real key riot-proxy still starts and serves `/healthz`, static data and (empty) analytics, but every call that reaches Riot fails: riot-proxy answers `UPSTREAM_ERROR` 502 "Upstream authentication failed" and the site shows 503 (observed with a placeholder key).
   - `AUTH_DISABLED=true` runs every request as the synthetic `dev-local` consumer and is refused when `ENV=production` (`riot-proxy:src/config.rs:658-662`, `riot-proxy:.env.example:158-159`). With it the site needs no `PROXY_KEY`.
   - On first start riot-proxy creates its database and prints a bootstrap admin key once (`riot-proxy:README.md:67`). With auth off you do not need it; never paste it into this repo.
   - Leave `ARCHIVE_OBJECT_URL` unset: riot-proxy then keeps every body in SQLite and touches no bucket (`riot-proxy:.env.example:80-83`). The site itself never uses object storage ([integration/object-storage.md](../integration/object-storage.md)).

3. Check it:

   ```sh
   curl -s http://127.0.0.1:8080/healthz      # {"ok":true}
   curl -s http://127.0.0.1:8080/readyz       # {"ok":true,"sqlite":true,"limiter":true,...}
   ```

4. Start the site against it:

   ```sh
   PROXY_URL=http://127.0.0.1:8080 PROXY_KEY= just dev
   ```

   `.env.example:3` already uses `http://127.0.0.1:8080`, so with an unedited `.env` plain `just dev` does the same.

5. Open `http://localhost:5173/`. With a real Riot key, any Riot ID should work. `/champions` rendered 200 with "No games recorded for this patch and role yet." against the fresh local database (riot-proxy answered `totalGames: 0`), because riot-proxy's analytics come from matches it has archived and aggregated.

> **TODO (unverified):** Option B was run with a placeholder Riot key only, so a profile and match page rendering live data against a local riot-proxy was not observed. Re-run step 5 with a development key from developer.riotgames.com.

To use auth instead, leave `AUTH_DISABLED` unset, mint a read key with `./riot-proxy-linux-amd64 key create --name local-site` (`riot-proxy:README.md:67-73`) and put it in `PROXY_KEY` in `.env`.

### Running the production build locally

```sh
pnpm build
PROXY_URL=http://127.0.0.1:8787 CDRAGON_URL=http://127.0.0.1:8787 \
PROXY_KEY=placeholder NODE_ENV=production PORT=4173 node build
```

With `NODE_ENV=production` the server refuses to start without `PROXY_KEY` (`src/lib/server/env.ts:47-55`); the mock ignores the value. Form posts (the profile's Refresh) are accepted only from the origin fixed at build time, so build with `ORIGIN=http://localhost:4173 pnpm build` if you want to test Refresh (`vite.config.ts:16-19`, ADR-014).

## 5. Regenerate API types after a spec change

```sh
just gen
```

`src/lib/api/schema.d.ts` is generated from `openapi/riot-proxy.json` and never edited by hand (`justfile:15-17`, `CLAUDE.md:25`). Refreshing the spec itself is in `README.md:46-66` and [release-process.md](./release-process.md).

## Ports used

| Port | What                                | Source                                      |
| ---- | ----------------------------------- | ------------------------------------------- |
| 5173 | Vite dev server (`just dev`)        | observed                                    |
| 4173 | `node build` under Playwright       | `playwright.config.ts:5,23`                 |
| 8787 | mock proxy                          | `playwright.config.ts:3`                    |
| 8080 | a local riot-proxy                  | `.env.example:3`, `riot-proxy:README.md:98` |
| 3000 | `node build` default (adapter-node) | `.env.example:18`                           |

## Known noise

The dev server prints `[sveltekit] error_body_deprecated` when a riot-proxy failure is turned into an error page. It comes from `error(status, { message, retryAfter })` in `src/lib/server/errors.ts:36-39`, which SvelteKit 3 still accepts but marks deprecated. The page renders correctly.

## Verified on

2026-10-20, Node 22.23.3, pnpm 12.10.1, just 1.58.0:

```text
$ git clone <repo> clean && cd clean && just setup     # installed, hooks set, .env created
$ just check                                          # exit 0 (30 s)
$ pnpm vitest run (repeated)                          # 332 passed, or 1 flaky timeout failure
$ node tests/mock-proxy/server.ts 8787 + just dev     # 4 recorded pages: 200
$ riot-proxy v2.7.0 (placeholder key, AUTH_DISABLED) + just dev
    /, /healthz, /champions: 200; /summoner/…, /match/…: 503 (Riot rejected the key)
```

---

**Sources:** `package.json:L5-L8`, `.npmrc:L1`, `justfile:L5-L28`, `.githooks/pre-commit:L4-L23`, `.githooks/pre-push:L1-L3`, `README.md:L10-L66`, `.env.example:L1-L21`, `src/lib/server/env.ts:L10-L55`, `src/lib/server/errors.ts:L36-L39`, `playwright.config.ts:L3-L31`, `tests/mock-proxy/mock.ts:L27-L48`, `tests/mock-proxy/server.ts:L1-L12`, `vite.config.ts:L16-L19`, `node_modules/@sveltejs/kit/src/exports/vite/dev/index.js:L295`, `riot-proxy:README.md:L1-L98`, `riot-proxy:src/config.rs:L610-L662`, `riot-proxy:.env.example:L80-L83,L158-L159`, `riot-proxy:docs/design/12-object-storage-and-hosting.md:L802-L806`
**Last verified:** 2026-10-20 against commit `85d9cf8`
