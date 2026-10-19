# 0003: Production runs `node build` under systemd, not in Docker

Production runs the built site as a plain systemd service beside riot-proxy, reached only through the Cloudflare Tunnel; the Docker files serve only the LAN preview VM.

## Context

The plan put the site in a Docker container next to `cloudflared` and riot-proxy on a Proxmox VM (`docs/IMPLEMENTATION.md:327-402`). Production is instead a rented server that already ran riot-proxy as a systemd service with `cloudflared` as a system service (ADR-038, `docs/DECISIONS.md:504`). The repo is private, so the server cannot pull a public image.

## Decision

- A checkout at `/opt/ninjagoldfinch-lol`, pulled with a read-only deploy key, built in place with `pnpm install --frozen-lockfile` and `ORIGIN=https://ninjagoldfinch.lol pnpm build` (`docs/DECISIONS.md:508`, `README.md:103-111`).
- `ninjagoldfinch-lol.service` runs `/usr/bin/node build` as user `ninjagoldfinch-lol`, with `EnvironmentFile=/etc/ninjagoldfinch-lol/env`, `Restart=always`, `RestartSec=2`, `ProtectSystem=strict`, `PrivateTmp=yes`, `NoNewPrivileges=yes`, ordered `After=riot-proxy.service` (owner-supplied unit, 2026-10-19).
- `HOST=127.0.0.1`; the Tunnel routes `ninjagoldfinch.lol` to `http://127.0.0.1:3000` (`docs/DECISIONS.md:509-510`).
- `Dockerfile`, `deploy/compose.yaml` and `deploy/proxmox/` stay for the preview VM (`docs/DECISIONS.md:511`).

## Consequences

- Node and pnpm are installed on the host. pnpm 12.10.1 comes from `npm install -g` because Ubuntu 26.04's `node-corepack` cannot load pnpm 12 (`riot-proxy:docs/design/12-object-storage-and-hosting.md:802-806`).
- The unit file and env file live only on the host; neither is in the repo (`docs/DECISIONS.md:513`).
- The plan's deployment section and the compose-with-cloudflared item describe a setup production does not use.
- ADR-038 records the server as "2 vCPU, 4 GB"; production has since moved to `ngf-prod-syd1` (6 vCPU, 12 GB) (`riot-proxy:docs/DECISIONS.md:1510`).

## Status

Accepted, in force on `ngf-prod-syd1`.

## Evidence

ADR-038, `README.md:90-113`, owner-supplied `systemctl cat ninjagoldfinch-lol` (see `docs/_meta/inventory.md` section 14).

---

**Sources:** `docs/DECISIONS.md:L500-L513`, `docs/IMPLEMENTATION.md:L327-L402`, `README.md:L90-L113`, `riot-proxy:docs/design/12-object-storage-and-hosting.md:L802-L806`, `riot-proxy:docs/DECISIONS.md:L1510`, owner-supplied unit (2026-10-19)
**Last verified:** 2026-10-19 against commit `85d9cf8`
