# Environments

The places ninjagoldfinch.lol runs, which riot-proxy each one talks to, with which key, and how they differ. Development no longer depends on any shared machine.

## Summary

| Environment   | Site                                                               | riot-proxy                                         | Key                                                    | Object storage                         | Status  |
| ------------- | ------------------------------------------------------------------ | -------------------------------------------------- | ------------------------------------------------------ | -------------------------------------- | ------- |
| production    | `https://ninjagoldfinch.lol` → `127.0.0.1:3000` on `ngf-prod-syd1` | `http://127.0.0.1:8080`, same host                 | `ninjagoldfinch-lol-prod` (`read`)                     | riot-proxy's Onidel bucket, R2 replica | live    |
| local dev     | `http://localhost:5173` (`just dev`)                               | one you run yourself, e.g. `http://127.0.0.1:8080` | none with `AUTH_DISABLED=true`, else your own read key | none needed                            | active  |
| test          | `http://localhost:4173` (`node build`)                             | mock proxy `http://127.0.0.1:8787`                 | `e2e-placeholder` (ignored)                            | none                                   | active  |
| LAN dev proxy | —                                                                  | `http://192.168.68.46:8080`, auth off              | none                                                   | —                                      | dormant |
| preview VM    | `http://192.168.68.47:3000`                                        | per `deploy/.env`                                  | per `deploy/.env`                                      | —                                      | deleted |

## Production

- Host `ngf-prod-syd1`, Onidel ONI-4 in Sydney, Ubuntu 26.04, shared with riot-proxy and `cloudflared` (`riot-proxy:docs/DECISIONS.md:1510`).
- Service `ninjagoldfinch-lol.service`: `/usr/bin/node build` in `/opt/ninjagoldfinch-lol` as user `ninjagoldfinch-lol`, settings from `/etc/ninjagoldfinch-lol/env` (owner-supplied unit, 2026-10-19).
- Settings present: `NODE_ENV`, `HOST`, `PORT`, `PROXY_URL`, `PROXY_KEY` (names supplied by the owner, 2026-10-19). `HOST=127.0.0.1` (`docs/DECISIONS.md:509`); `PROXY_URL=http://127.0.0.1:8080` (`riot-proxy:docs/design/12-object-storage-and-hosting.md:630`); `CDRAGON_URL` and `PUBLIC_SITE_NAME` take their defaults.
- Built with `ORIGIN=https://ninjagoldfinch.lol` (`README.md:110`).
- Public only through the Cloudflare Tunnel; the edge caches pages per `Cache-Control`.
- riot-proxy runs with auth on; it refuses `AUTH_DISABLED` when `ENV=production` (`riot-proxy:src/config.rs:658-662`).

> **TODO (unverified):** the value of `PORT` in production. `README.md:100` says the site listens on `127.0.0.1:3000` and the Tunnel routes to `:3000` (`riot-proxy:docs/design/13-admin-dashboard.md:64`), so it is presumably `3000`.

## Local dev

The site needs a riot-proxy; there is no shared development instance (`.env.example:1-3`, `README.md:46`). Run riot-proxy on your own machine:

1. Get riot-proxy: a release binary checked against `sha256sums`, the image `ghcr.io/ninjagoldfinch/riot-proxy:2`, or `cargo build --release` (`riot-proxy:README.md:7-26`).
2. In riot-proxy's `.env`, set your development `RIOT_API_KEY`, and either `AUTH_DISABLED=true` or mint a key with `riot-proxy key create --name <your-dev-key>` (`riot-proxy:README.md:60-72`).
3. Start it with `riot-proxy serve`; it listens on `0.0.0.0:8080` by default and stores data under `./data` (`riot-proxy:src/config.rs:622,699-700`).
4. In this repo, `just setup` creates `.env` from `.env.example`; set `PROXY_URL=http://127.0.0.1:8080` and `PROXY_KEY` (empty with auth off).
5. `just dev` serves the site on `http://localhost:5173` (Vite's default; observed 2026-10-19).

Differences from production:

- `NODE_ENV` is unset, so `PROXY_KEY` is optional (`src/lib/server/env.ts:47-55`).
- `ORIGIN` is not needed: without it SvelteKit derives the origin from the `Host` header (`vite.config.ts:16-19`, `.env.example:13-16`).
- A fresh riot-proxy has no analytics until it has archived matches and run an aggregate rebuild, so champion pages are empty at first. Profiles and matches fetch from Riot on demand.
- No object storage is needed: riot-proxy keeps every body in SQLite when `ARCHIVE_OBJECT_URL` is unset (`riot-proxy:src/config.rs:314-316`).
- Every uncached call spends your development Riot key's rate limit.

The full procedure, executed end to end, is in [workflows/development-setup.md](../workflows/development-setup.md).

## Test

Playwright starts two processes (`playwright.config.ts:3-31`):

- the mock proxy, `node tests/mock-proxy/server.ts 8787`, which replays `tests/fixtures/*.json` and answers 500 for anything unrecorded (`tests/mock-proxy/mock.ts:27-48`);
- the production build, `pnpm build && node build`, with `ORIGIN=http://localhost:4173`, `PORT=4173`, `NODE_ENV=production`, `PROXY_URL` and `CDRAGON_URL` pointing at the mock, and `PROXY_KEY=e2e-placeholder`.

Unit tests (`just check`) need neither. Nothing in either reaches riot-proxy or Riot.

## Dormant: the LAN dev proxy

A riot-proxy on the owner's Proxmox node at `http://192.168.68.46:8080`, running with auth disabled, served site development and the P1–P4 exit checks (`docs/PROGRESS.md:107,126,156,193`). It is not running. ADR-039 removed it from the docs (`docs/DECISIONS.md:538`), and RV-11 removed the last mention from `deploy/proxmox/README.md`. Nothing in the code depends on it: `PROXY_URL` has no default (`src/lib/server/env.ts:10-15`).

To use it again, start it and set `PROXY_URL=http://192.168.68.46:8080` with an empty `PROXY_KEY`.

## Dormant: the preview VM

VM 104 `ninjagoldfinch-web` at `192.168.68.47` built the site in Docker from a git checkout and served it on port 3000 over plain HTTP (`docs/PROGRESS.md:70-72`, ADR-010). The owner reports it no longer exists and may be recreated (2026-10-19). The scripts remain: `deploy/proxmox/create-vm.sh` (Debian 13, 2 cores, 2048 MB, 16 GB by default), `ninjagoldfinch-update [ref]`, and `deploy/compose.yaml`; `deploy/proxmox/test.sh` still runs in `just check`. Recreating it is documented in `deploy/proxmox/README.md` and, in Pass B, [deployment/preview-vm.md](../deployment/preview-vm.md).

---

**Sources:** `.env.example:L1-L25`, `README.md:L46,L100,L110`, `src/lib/server/env.ts:L10-L55`, `vite.config.ts:L16-L19`, `playwright.config.ts:L3-L31`, `tests/mock-proxy/mock.ts:L27-L48`, `deploy/proxmox/README.md:L3`, `deploy/proxmox/create-vm.sh:L26-L28`, `docs/PROGRESS.md:L70-L72,L107,L126,L156,L193`, `docs/DECISIONS.md:L509,L538`, `riot-proxy:README.md:L7-L26,L60-L72`, `riot-proxy:src/config.rs:L314-L316,L658-L662,L695-L768`, `riot-proxy:docs/DECISIONS.md:L1510`, `riot-proxy:docs/design/12-object-storage-and-hosting.md:L630`, `riot-proxy:docs/design/13-admin-dashboard.md:L64`, owner-supplied unit, env names and answers (2026-10-19); `pnpm dev` run 2026-10-19
**Last verified:** 2026-11-03 against commit `23a4f41`
