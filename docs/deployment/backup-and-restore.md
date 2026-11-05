# Backup and restore

What state ninjagoldfinch.lol has, which of it is backed up, and how to bring the site back on a new or rebuilt host. The short answer: the site keeps no data, so restoring it is reinstalling it; the only host-local things that matter are its settings file and systemd unit, and nothing in either repository backs those up.

## State inventory

| State                                               | Where                                                                  | Backed up?                                                                         | How to recover                                                                                                          |
| --------------------------------------------------- | ---------------------------------------------------------------------- | ---------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| Source code and history                             | GitHub `NinjaGoldfinch/ninjagoldfinch-lol` (private)                   | GitHub, plus every clone                                                           | `git clone`                                                                                                             |
| Built site                                          | `/opt/ninjagoldfinch-lol/build`                                        | No; reproducible                                                                   | `pnpm build` ([install.md](./install.md#5-clone-and-build))                                                             |
| Dependencies                                        | `/opt/ninjagoldfinch-lol/node_modules`                                 | No; reproducible from `pnpm-lock.yaml`                                             | `pnpm install --frozen-lockfile`                                                                                        |
| Settings `/etc/ninjagoldfinch-lol/env`              | production host only                                                   | Not by anything in either repo                                                     | Recreate: four values are known ([configuration.md](./configuration.md#production-values)); `PROXY_KEY` can be reissued |
| systemd unit                                        | `/etc/systemd/system/ninjagoldfinch-lol.service`                       | Not in a repo; its text is reproduced in [install.md](./install.md#7-systemd-unit) | Copy from install.md                                                                                                    |
| Deploy key                                          | the service user's SSH directory                                       | No, by design                                                                      | Generate a new one and add it on GitHub; revoke the old one                                                             |
| Event state `last-version.json`, `proxy-alarm.json` | `/var/lib/ninjagoldfinch-lol/` (the unit's `StateDirectory=`, ADR-063) | No; not needed                                                                     | Nothing to do: the next start writes them again (below)                                                                 |
| In-memory holds                                     | process memory                                                         | No; rebuilt on demand                                                              | Nothing to do ([data/caching.md](../data/caching.md))                                                                   |
| Edge cache                                          | Cloudflare                                                             | n/a                                                                                | Refills from the origin                                                                                                 |
| Visitors' recent searches                           | each browser's `localStorage`                                          | n/a                                                                                | Not the site's to restore (`src/lib/recent-storage.ts:6-22`)                                                            |
| Player, match and analytics data                    | riot-proxy                                                             | riot-proxy's backups (below)                                                       | riot-proxy's restore                                                                                                    |

At runtime the site writes only the two event-state files above (ADR-063). Its unit runs with `ProtectSystem=strict`, which makes the rest of the file system read-only to it (owner-supplied unit, [inventory section 14](../_meta/inventory.md#14-owner-supplied-evidence-not-in-any-repo)); `StateDirectory=` keeps `/var/lib/ninjagoldfinch-lol/` writable. Neither file needs a backup. Without `last-version.json` the next start records its version and sends no `deployed`; without `proxy-alarm.json` an outage that was under way is announced again after three failed checks. The inventory's persistence table predates these files and lists only memory, the edge and the browser ([inventory section 6](../_meta/inventory.md#6-persistence)).

> **TODO (unverified):** Whether `ngf-prod-syd1` has host-level backups or snapshots (Onidel's own, or another tool) that would cover `/etc/ninjagoldfinch-lol/env` and the unit. Neither repository mentions any. Check the Onidel console for the server's backup setting.

## Restoring the site

Restore is a fresh install; follow [install.md](./install.md) in full. Differences from a first install:

1. **Settings.** Recreate `/etc/ninjagoldfinch-lol/env` with `NODE_ENV=production`, `HOST=127.0.0.1`, `PORT=3000`, `PROXY_URL=http://127.0.0.1:8080` and the key. If the old key's value is lost, mint a new read key on riot-proxy and revoke the old one by name ([integration/authentication.md](../integration/authentication.md)).
2. **Deploy key.** Generate a new one; remove the old host's key from the repo's Deploy keys on GitHub.
3. **Version.** Build the commit production was running if you know it; otherwise the latest `main`. Check it matches riot-proxy's spec version ([upgrade-and-rollback.md](./upgrade-and-rollback.md#before-upgrading)).
4. **Tunnel.** If the host changed, move the `cloudflared` connector; no DNS change is needed (`riot-proxy:docs/design/12-object-storage-and-hosting.md:532-537`).

Measured on a development machine on 2026-10-20: `pnpm install` from a warm store and `pnpm build` together take a few seconds, so the site's own restore time is dominated by package downloads and by setting up the host and the Tunnel.

## riot-proxy's backups (for context)

The site's data lives in riot-proxy, so a full platform restore depends on riot-proxy's backups. These belong to riot-proxy and are documented there; in brief:

| What                            | Where                                                         | Schedule and retention                                                                        | Source                                                                                 |
| ------------------------------- | ------------------------------------------------------------- | --------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| SQLite snapshot (`VACUUM INTO`) | `$DATA_DIR/backups/` on the host                              | daily maintenance job                                                                         | `riot-proxy:README.md:134-142`                                                         |
| Off-box copy of those snapshots | Cloudflare R2 `ngf-backups`, prefix `riot-proxy/`             | every 6 h by `riot-proxy-offsite.timer` (not in a repo), 14-day expiry; one local backup kept | `riot-proxy:docs/design/12-object-storage-and-hosting.md:808-821`                      |
| Match and timeline packs        | Onidel Object Storage `riot-proxy-archive` (system of record) | written by riot-proxy; `packs/` kept forever                                                  | `riot-proxy:deploy/README.md:14-36`                                                    |
| Replica of the packs            | Cloudflare R2 `riot-proxy-archive`                            | hourly `rclone sync`; riot-proxy never reads it                                               | `riot-proxy:deploy/README.md:14-18`, `riot-proxy:deploy/riot-proxy-replica.timer:1-10` |

R2 is therefore both the replica of the Onidel archive and the off-box home of the database backups; Onidel holds no copy of R2. Restoring riot-proxy's database means stopping it, putting a backup back as `$DATA_DIR/riot-proxy.db`, and starting it (`riot-proxy:README.md:142`). A restore drill on 2026-10-15 served a body from R2 using the 2026-10-14 backup from `ngf-backups` (`riot-proxy:PROGRESS.md:335`). See [integration/object-storage.md](../integration/object-storage.md).

While riot-proxy is being restored the site stays up: `/healthz` answers, data pages answer 503 "Temporarily unavailable", and cached pages keep being served from the edge until they expire.

## Testing a restore

There is no scheduled restore test for the site. To test one without touching production:

1. On a scratch Ubuntu 26.04 machine or VM, follow [install.md](./install.md) steps 1 to 8 with `PROXY_URL` pointing at a local riot-proxy started with `AUTH_DISABLED=true` ([workflows/development-setup.md](../workflows/development-setup.md#option-b-against-a-riot-proxy-you-run-yourself)), and any placeholder `PROXY_KEY`.
2. Check `curl -s http://127.0.0.1:3000/healthz` returns `{"ok":true,…}` and `/champions` returns 200.
3. Skip the Tunnel step; do not attach a second connector to the production Tunnel.

Steps 5 to 8 of that procedure were run outside systemd on 2026-10-20 and behaved as written.

---

**Sources:** `src/lib/recent-storage.ts:L6-L22`, owner-supplied unit and env names (inventory sections 6 and 14), `riot-proxy:README.md:L134-L142`, `riot-proxy:docs/design/12-object-storage-and-hosting.md:L532-L537,L808-L821`, `riot-proxy:deploy/README.md:L14-L36`, `riot-proxy:deploy/riot-proxy-replica.timer:L1-L10`, `riot-proxy:PROGRESS.md:L335`
**Last verified:** 2026-10-20 against commit `85d9cf8`
