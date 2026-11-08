# Runbook

Commands and decisions for operating ninjagoldfinch.lol on `ngf-prod-syd1`: service control, logs, health, keys, caches, and what to do when riot-proxy, Riot, object storage, the disk or the bandwidth allowance is the problem. Symptom-first diagnosis is in [troubleshooting.md](./troubleshooting.md).

All commands run on the host as a user with sudo, unless marked otherwise.

## Service control

| Task             | Command                                                                              |
| ---------------- | ------------------------------------------------------------------------------------ |
| Status           | `systemctl status ninjagoldfinch-lol`                                                |
| Start / stop     | `sudo systemctl start ninjagoldfinch-lol` / `sudo systemctl stop ninjagoldfinch-lol` |
| Restart          | `sudo systemctl restart ninjagoldfinch-lol`                                          |
| Show the unit    | `systemctl cat ninjagoldfinch-lol`                                                   |
| Is it on at boot | `systemctl is-enabled ninjagoldfinch-lol`                                            |

The unit restarts the process 2 s after any exit (`Restart=always`, `RestartSec=2`) and starts after riot-proxy without requiring it (owner-supplied unit, [inventory section 14](../_meta/inventory.md#14-owner-supplied-evidence-not-in-any-repo)). A restart drops nothing that matters: the only state is the in-memory holds, which refill on demand ([data/caching.md](../data/caching.md#site-in-memory-lookups)).

Deploying and rolling back: [deployment/upgrade-and-rollback.md](../deployment/upgrade-and-rollback.md).

## Logs

```sh
sudo journalctl -u ninjagoldfinch-lol -f                      # follow
sudo journalctl -u ninjagoldfinch-lol --since '-1 hour'       # recent
sudo journalctl -u ninjagoldfinch-lol | grep 'proxy '         # every riot-proxy failure
```

Logs are plain text from `console.error`/`console.warn`, collected by journald (`README.md:101`); there is no log level setting. Every line the site writes is listed in [integration/monitoring-hooks.md](../integration/monitoring-hooks.md#logs).

**Following a failure into riot-proxy.** A failed call is logged as `proxy <status> <METHOD> <path> request-id=<id>` (`src/lib/server/proxy.ts:12-18`). riot-proxy writes the same id as `request_id` in its JSON log, so:

```sh
sudo journalctl -u riot-proxy | grep '<id>'
```

Checked on 2026-10-20 with a local riot-proxy v2.7.0: a site line `proxy 401 GET /v1/lol/analytics/champions request-id=01M5A58Z…` matched a riot-proxy line `"message":"rejected unknown key", … "request_id":"01M5A58Z…"`.

## Health checks

```sh
curl -s http://127.0.0.1:3000/healthz                                       # {"ok":true,"version":"…"}: the process is up
curl -s -o /dev/null -w '%{http_code}\n' http://127.0.0.1:3000/champions    # 200: riot-proxy is usable
curl -s http://127.0.0.1:8080/readyz                                        # riot-proxy's own readiness
curl -sI https://ninjagoldfinch.lol/healthz | head -1                       # through Cloudflare
```

`/healthz` never calls riot-proxy (`src/routes/healthz/+server.ts:7-9`), so a healthy `/healthz` with failing pages points at riot-proxy, the key, or Riot. The site has no readiness endpoint ([integration/monitoring-hooks.md](../integration/monitoring-hooks.md#endpoints)).

From outside, ninja-monitor on `ngf-mon-syd1` fetches `https://ninjagoldfinch.lol/healthz` through Cloudflare every minute and pings Healthchecks.io each minute (P5-05). An email from Healthchecks.io means the pings stopped for 5 minutes: either ninja-monitor on `ngf-mon-syd1` is down, or the site is and ninja-monitor's Discord alert did not reach you. Run the checks above first, then look at ninja-monitor ([ninja-monitor alerts](#ninja-monitor-alerts)).

## Keys

### Rotate the site's riot-proxy key (`PROXY_KEY`)

Create, switch, revoke; riot-proxy has no rotate command. The full procedure and the riot-proxy commands are in [integration/authentication.md](../integration/authentication.md#rotate-a-key). On the site's side:

1. Edit the key in place without printing the file:

   ```sh
   sudoedit /etc/ninjagoldfinch-lol/env          # replace the PROXY_KEY= line
   sudo stat -c '%a %U' /etc/ninjagoldfinch-lol/env   # still 600 root
   ```

2. `sudo systemctl restart ninjagoldfinch-lol`
3. Load `/champions` and a profile; `sudo journalctl -u ninjagoldfinch-lol --since '-5 min' | grep 'proxy 401'` must print nothing.
4. Revoke the old key on riot-proxy. It may keep working for up to 60 s from riot-proxy's auth cache when revoked by CLI ([integration/authentication.md](../integration/authentication.md#revoke-a-key)).

### Riot API key and object-storage keys

The site holds neither. Rotating the Riot key, the Onidel key or the R2 tokens is done on riot-proxy and `rclone` and needs no change to the site; see riot-proxy's documentation and [integration/object-storage.md](../integration/object-storage.md). While riot-proxy restarts for a new key, the site's data pages answer errors for a few seconds.

### Deploy key

Generate a new key as the `ninjagoldfinch-lol` user, add it on GitHub, test `git fetch`, then delete the old one on GitHub ([deployment/install.md](../deployment/install.md#4-deploy-key)).

### Cloudflare Tunnel token

Rotate in the Cloudflare dashboard and replace `/etc/cloudflared/token`, then `sudo systemctl restart cloudflared`. Both public hostnames drop while it reconnects.

## Clearing caches

| Cache                                                          | How to clear                                                         | When                                                                                                                                                                               |
| -------------------------------------------------------------- | -------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Site in-memory holds (patch, Data Dragon lookups, stat shards) | `sudo systemctl restart ninjagoldfinch-lol`                          | Pages show an old patch's names well over 5 min after riot-proxy moved to a new patch; check [troubleshooting.md](./troubleshooting.md#14-old-patch-icons-after-a-new-patch) first |
| Cloudflare edge                                                | Dashboard → the zone → Caching → Purge Cache (by URL, or everything) | A bad deploy rendered pages that are still cached (match pages: up to a day plus a day stale)                                                                                      |
| riot-proxy caches                                              | riot-proxy's documentation                                           | Stale player data; the site cannot clear these                                                                                                                                     |
| A visitor's recent searches                                    | The visitor's browser (`localStorage` key `recent-searches`)         | Never needed by an operator                                                                                                                                                        |

TTLs: [data/caching.md](../data/caching.md).

## riot-proxy down or hung

Symptoms: `/healthz` 200 but data pages fail; ninja-monitor reports `riot-proxy` down.

| riot-proxy state                        | What visitors get                                                                  | Site log                                                          |
| --------------------------------------- | ---------------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| Stopped (connection refused)            | "Temporarily unavailable", HTTP 503, at once (HTTP 500 before RV-03)               | `proxy unreachable GET …: TypeError: fetch failed … ECONNREFUSED` |
| Accepting connections but not answering | "Temporarily unavailable", HTTP 503 after 5 s (champions) or 30 s (profile, match) | `proxy timeout GET … after 5000 ms` (or `30000 ms`)               |
| Answering 401 (bad key)                 | HTTP 503                                                                           | `proxy 401 GET … request-id=…`                                    |

Observed on 2026-10-20 with the production build, before RV-03; RV-03 changed the refused connection from 500 to 503, the timeout log line, and fixed a match request against a hung riot-proxy that never finished (`src/lib/server/proxy.ts:125-129`).

1. `systemctl status riot-proxy` and `curl -s http://127.0.0.1:8080/readyz`.
2. `sudo journalctl -u riot-proxy --since '-15 min'`.
3. Fix or restart riot-proxy per its own runbook. The site needs no restart; it recovers on the next request.

Pages already at the edge keep being served until they expire, which hides short outages for popular pages. Errors are never cached, except 404s for 60 s, and nor are redirects or pages with an optional part missing (`src/hooks.server.ts:20-32`, ADR-045). A page rendered while riot-proxy's analytics or the timeline were failing is therefore tried again on the next view.

## Riot outage or Riot key suspended

riot-proxy owns the Riot key; the site sees only riot-proxy's answers.

- **Riot rejects the key** (expired or suspended): riot-proxy answers `UPSTREAM_ERROR` 502 "Upstream authentication failed" for anything that needs Riot; the site shows 503 for uncached profiles and unarchived matches (observed with an invalid key on a local riot-proxy). Champion pages and archived matches keep working because they do not call Riot.
- **Riot rate-limits or is slow:** riot-proxy answers `RATE_LIMITED` (HTTP 503 with `retryAfter`) and the site shows "Too many requests, try again in N seconds" (`src/lib/server/errors.ts:24-30`).
- **Riot is down:** riot-proxy serves what it has cached; uncached lookups fail as above.

Action: renew or replace the Riot key on riot-proxy (`RIOT_API_KEY` in `/etc/riot-proxy/env`, then restart riot-proxy). Nothing changes on the site.

## Object storage outage

The site uses no bucket. If Onidel Object Storage is unavailable, riot-proxy fetches old matches from Riot again instead of from its archive, so old match pages are slower and spend Riot rate limit; under pressure they may show "Too many requests". An R2 outage affects only riot-proxy's replica and backups. Details: [integration/object-storage.md](../integration/object-storage.md#what-an-outage-means-for-the-site).

## Disk full on the shared 120 GB volume

ninja-monitor warns at 70 % and 85 % (`riot-proxy:docs/design/12-object-storage-and-hosting.md:836`).

1. See what is using it:

   ```sh
   df -h /
   sudo du -xsh /var/lib/riot-proxy/data /opt/ninjagoldfinch-lol /opt/ninjagoldfinch-lol-home /var/log 2>/dev/null
   journalctl --disk-usage
   ```

2. The site's part is small and fixed: about 200 MB of checkout and `node_modules` plus pnpm's store ([deployment/capacity.md](../deployment/capacity.md#disk)). The large consumer is riot-proxy's database and its local backup; follow riot-proxy's runbook for those.
3. Safe space to reclaim on the site's side:

   ```sh
   sudo journalctl --vacuum-size=500M                       # all units' journals; choose the size
   sudo -H -u ninjagoldfinch-lol pnpm store prune           # unreferenced packages in the user's store
   ```

Effects of a full disk on the site: the running process keeps serving (pages need no disk), journald may drop log lines, and a deploy fails at `pnpm install` or `pnpm build`. The only files the site writes are the two event-state files in `/var/lib/ninjagoldfinch-lol/` (ADR-063); a write that fails is logged (`could not record the version in …`, `could not record the alarm in …`) and costs a `deployed` event, or the alarm's memory across a restart, nothing else. Do not deploy until there is room: a failed build can leave `build/` missing ([deployment/upgrade-and-rollback.md](../deployment/upgrade-and-rollback.md#upgrade)).

## Bandwidth near the 6 TB allowance

1. Check usage in the Onidel console for `ngf-prod-syd1`.
2. The site's share is HTML through the Tunnel, about 60–140 KB per uncached page ([deployment/capacity.md](../deployment/capacity.md#bandwidth)); images are served by Riot's and CommunityDragon's CDNs, not the host. Riot fan-out, object-storage traffic and the hourly R2 replica are riot-proxy's.
3. If the site is the cause (a crawler hitting uncached pages): look at Cloudflare's analytics for the zone, and add a Cloudflare rate-limiting or bot rule for `/summoner/*` and `/match/*`. Whether such a rule exists today is unconfirmed ([architecture/concurrency-and-rate-limiting.md](../architecture/concurrency-and-rate-limiting.md)).

## ninja-monitor alerts

ninja-monitor posts to Discord. Its checks on this host, from riot-proxy's notes (`riot-proxy:docs/design/12-object-storage-and-hosting.md:832-838`):

| Alert                                                        | First response                                                                                                                                                                |
| ------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ninjagoldfinch-lol` down (after 30 s; repeats every 30 min) | `systemctl status ninjagoldfinch-lol`; `journalctl -u ninjagoldfinch-lol -n 50`. A start-up `env_invalid` names the bad variable ([troubleshooting.md](./troubleshooting.md)) |
| `ninjagoldfinch-lol` memory over 1 GiB                       | Check traffic and errors; V8 heap growth under load is expected ([deployment/capacity.md](../deployment/capacity.md#memory)); restart if it keeps climbing                    |
| `riot-proxy` down or over 2 GiB                              | riot-proxy's runbook; the site will show errors until it is back                                                                                                              |
| `cloudflared` down or over 512 MiB                           | `sudo systemctl restart cloudflared`; the whole site is unreachable from outside while it is down                                                                             |
| Disk over 70 % / 85 %                                        | [Disk full](#disk-full-on-the-shared-120-gb-volume)                                                                                                                           |
| Host memory below 15 % free                                  | `free -m`, `systemctl status` for each service's memory; riot-proxy's page cache use is normal                                                                                |
| Host CPU over 90 % for 20 min                                | `top`; usually riot-proxy's background jobs                                                                                                                                   |

> **TODO (unverified):** ninja-monitor's alert texts, its threshold for a failed `/healthz` probe, and whether it still pings Healthchecks.io after a failed probe. Neither repository contains its configuration.

---

**Sources:** owner-supplied unit (inventory section 14), `README.md:L95-L112`, `src/routes/healthz/+server.ts:L7-L9`, `src/lib/server/proxy.ts:L12-L20,L125-L129`, `src/lib/server/errors.ts:L16-L33`, `src/hooks.server.ts:L18-L39`, `riot-proxy:docs/design/12-object-storage-and-hosting.md:L832-L838`; observed with the production build and riot-proxy v2.7.0 on 2026-10-20 (refused connection, hung socket, invalid consumer key, invalid Riot key), `docs/PROGRESS.md` ("P5-05 check")
**Last verified:** 2026-11-09 against commit `02630bb`
