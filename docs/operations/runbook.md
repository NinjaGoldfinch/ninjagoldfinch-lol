# Runbook

Commands and decisions for operating ninjagoldfinch.lol on `ngf-prod-syd1`: service control, logs, health, keys, caches, and what to do when riot-proxy, Riot, object storage, the disk or the bandwidth allowance is the problem. Symptom-first diagnosis is in [troubleshooting.md](./troubleshooting.md).

All commands run on the host as a user with sudo, unless marked otherwise.

## Service control

| Task             | Command                                                                              |
| ---------------- | ------------------------------------------------------------------------------------ |
| Status           | `systemctl status ninjagoldfinch-lol`                                                |
| Start / stop     | `sudo systemctl start ninjagoldfinch-lol` / `sudo systemctl stop ninjagoldfinch-lol` |
| Restart          | `sudo systemctl restart ninjagoldfinch-lol`                                          |
| Show the unit    | `systemctl cat ninjagoldfinch-lol` (the unit and its `ninja-deploy.conf` drop-in)    |
| Live release     | `readlink /srv/ninjagoldfinch-lol/current`; `cat /srv/ninjagoldfinch-lol/live.json`  |
| Is it on at boot | `systemctl is-enabled ninjagoldfinch-lol`                                            |

The unit restarts the process 2 s after any exit (`Restart=always`, `RestartSec=2`) and starts after riot-proxy without requiring it (owner-supplied unit, [inventory section 14](../_meta/inventory.md#14-owner-supplied-evidence-not-in-any-repo)). A restart drops nothing that matters: the in-memory holds refill on demand ([data/caching.md](../data/caching.md#site-in-memory-lookups)), and, once the drop-in with `StateDirectory=` is installed (unverified on both hosts, [gaps.md](../_meta/gaps.md)), the files in `/var/lib/ninjagoldfinch-lol/` are kept across it: the last start's version, and, when `EVENTS_URL` is set, whether a `proxy_unreachable` event is raised (ADR-063, ADR-064). The `/api/status` counters start again from zero.

Deploying and rolling back: [deployment/releases.md](../deployment/releases.md) (through `deploy.yml`, ADR-053) and [deployment/upgrade-and-rollback.md](../deployment/upgrade-and-rollback.md).

## Logs

```sh
sudo journalctl -u ninjagoldfinch-lol -f                      # follow
sudo journalctl -u ninjagoldfinch-lol --since '-1 hour'       # recent
sudo journalctl -u ninjagoldfinch-lol | grep 'proxy '         # every riot-proxy failure
```

Logs are plain text from `console.error`/`console.warn`, collected by journald (`README.md:194`), plus one `console.log` at each start with the build's version and commit; there is no log level setting. Every line the site writes is listed in [integration/monitoring-hooks.md](../integration/monitoring-hooks.md#logs).

**Following a failure into riot-proxy.** A failed call is logged as `proxy <status> <METHOD> <path> request-id=<id>` (`src/lib/server/proxy.ts:13-20`). riot-proxy writes the same id as `request_id` in its JSON log, so:

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
curl -s http://127.0.0.1:3000/api/status                                    # checks and counters; no token needed on the host
```

`/healthz` never calls riot-proxy (`src/routes/healthz/+server.ts:6-9`), so a healthy `/healthz` with failing pages points at riot-proxy, the key, or Riot. The site has no readiness endpoint of its own; `/api/status`'s `riot_proxy` check, run in the background, shows whether riot-proxy is reachable, ready and accepting the key (ADR-062, [integration/monitoring-hooks.md](../integration/monitoring-hooks.md#endpoints)).

### An email from Healthchecks.io

A heartbeat from `ngf-mon-syd1`, the monitoring host, pings a Healthchecks.io check every minute (P5-05). An email from Healthchecks.io says only that those pings stopped. What sends them, and whether they depend on the site, are unverified ([integration/monitoring-hooks.md](../integration/monitoring-hooks.md#from-outside-the-heartbeat-to-healthchecksio)). Check in this order:

1. The monitoring box, `ngf-mon-syd1`: whether it is up, and whether whatever sends the heartbeat is running.
2. The site, with the health checks above.
3. ninja-monitor's Discord alerts for the production host ([ninja-monitor alerts](#ninja-monitor-alerts)).

> **TODO (unverified):** the commands to check `ngf-mon-syd1` and the process that sends its heartbeat (how to reach the box, the unit's name, where its logs are). They are not recorded anywhere.

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

### Deploy keys

Releases reach the host with the `prod` environment's `DEPLOY_SSH_KEY`, whose public half the host forces to `ninja-deploy ninjagoldfinch-lol` (ADR-053). To replace it, make a new key and set the secret as in [deployment/releases.md](../deployment/releases.md#2-the-prod-environment-on-github), then run `deploy-host-add.sh` again as in [step 3](../deployment/releases.md#3-ninja-deploy-for-the-site-on-ngf-prod-syd1) with the new public key. It replaces the site's old key, so nothing is removed by hand: the other lines in the `deploy` user's `authorized_keys` belong to other services that share that user, and deleting one breaks that service's deploys (`ninja-actions:infra/deploy-host-add.sh:196-204`). The same run rewrites `/etc/ninja-deploy/ninjagoldfinch-lol.conf` from its arguments, so repeat any extra option the host's conf has (`SHARED`, `KEEP`, `HEALTH_WAIT`, `SMOKE_URLS`); one left out returns to its default (`ninja-actions:infra/deploy-host-add.sh:169-180`). Staging has a key of its own in the `staging` environment.

The old checkout's read-only GitHub deploy key is only for the fallback checkout and goes with it ([deployment/releases.md](../deployment/releases.md#6-retire-the-checkout-deploy)); while it is kept, rotate it as in [deployment/install.md](../deployment/install.md#4-deploy-key).

### Cloudflare Tunnel token

Rotate in the Cloudflare dashboard and replace `/etc/cloudflared/token`, then `sudo systemctl restart cloudflared`. Every hostname the tunnel serves, `ninjagoldfinch.lol`, `api.` and `admin.`, drops while it reconnects ([deployment/overview.md](../deployment/overview.md#hostnames-and-routes)).

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

Observed on 2026-10-20 with the production build, before RV-03; RV-03 changed the refused connection from 500 to 503, the timeout log line, and fixed a match request against a hung riot-proxy that never finished (`src/lib/server/proxy.ts:124-131`).

1. `systemctl status riot-proxy` and `curl -s http://127.0.0.1:8080/readyz`.
2. `sudo journalctl -u riot-proxy --since '-15 min'`.
3. Fix or restart riot-proxy per its own runbook. The site needs no restart; it recovers on the next request.

Pages already at the edge keep being served until they expire, which hides short outages for popular pages. Errors are never cached, except 404s for 60 s, and nor are redirects or pages with an optional part missing (`src/hooks.server.ts:32-54`, ADR-045). A page rendered while riot-proxy's analytics or the timeline were failing is therefore tried again on the next view.

## Riot outage or Riot key suspended

riot-proxy owns the Riot key; the site sees only riot-proxy's answers.

- **Riot rejects the key** (expired or suspended): riot-proxy answers `UPSTREAM_ERROR` 502 "Upstream authentication failed" for anything that needs Riot; the site shows 503 for uncached profiles and unarchived matches (observed with an invalid key on a local riot-proxy). Champion pages and archived matches keep working because they do not call Riot.
- **Riot rate-limits or is slow:** riot-proxy answers `RATE_LIMITED` (HTTP 503 with `retryAfter`) and the site shows "Too many requests, try again in N seconds" (`src/lib/server/errors.ts:24-30`).
- **Riot is down:** riot-proxy serves what it has cached; uncached lookups fail as above.

Action: renew or replace the Riot key on riot-proxy (`RIOT_API_KEY` in `/etc/riot-proxy/env`, then restart riot-proxy). Nothing changes on the site.

## Object storage outage

The site uses no bucket. If Onidel Object Storage is unavailable, riot-proxy fetches old matches from Riot again instead of from its archive, so old match pages are slower and spend Riot rate limit; under pressure they may show "Too many requests". An R2 outage affects only riot-proxy's replica and backups. Details: [integration/object-storage.md](../integration/object-storage.md#what-an-outage-means-for-the-site).

## Disk full on the shared 120 GB volume

ninja-monitor warns at 70 % and 85 % (`riot-proxy:docs/design/12-object-storage-and-hosting.md:843`).

1. See what is using it:

   ```sh
   df -h /
   sudo du -xsh /var/lib/riot-proxy/data /srv/ninjagoldfinch-lol /opt/ninjagoldfinch-lol /opt/ninjagoldfinch-lol-home /var/log 2>/dev/null
   journalctl --disk-usage
   ```

2. The site's part is small and fixed: its releases, about 3 MB each and the newest 5 kept, and, while the fallback checkout is kept, about 200–400 MB of checkout, `node_modules` and pnpm's store ([deployment/capacity.md](../deployment/capacity.md#disk)). The large consumer is riot-proxy's database and its local backup; follow riot-proxy's runbook for those.
3. Safe space to reclaim on the site's side:

   ```sh
   sudo journalctl --vacuum-size=500M                       # all units' journals; choose the size
   sudo -H -u ninjagoldfinch-lol pnpm store prune           # unreferenced packages in the user's store, while the checkout is kept
   ```

   Removing the old checkout frees most of the site's share, once releases have settled ([deployment/releases.md](../deployment/releases.md#6-retire-the-checkout-deploy)).

Effects of a full disk on the site: the running process keeps serving (pages need no disk), journald may drop log lines, and a deploy fails while the release is unpacked: `ninja-deploy` unpacks into a temporary directory it removes on failure, and `current` is not touched, so the live release keeps running (`ninja-actions:infra/deploy.sh:125-140`). The only files the site writes are the two event-state files in `/var/lib/ninjagoldfinch-lol/` (ADR-063); a write that fails is logged (`could not record the version in …`, `could not record the alarm in …`) and costs a `deployed` event, or the alarm's memory across a restart, nothing else. Do not deploy until there is room.

## Bandwidth near the 6 TB allowance

1. Check usage in the Onidel console for `ngf-prod-syd1`.
2. The site's share is HTML through the Tunnel, about 60–140 KB per uncached page ([deployment/capacity.md](../deployment/capacity.md#bandwidth)); images are served by Riot's and CommunityDragon's CDNs, not the host. Riot fan-out, object-storage traffic and the hourly R2 replica are riot-proxy's.
3. If the site is the cause (a crawler hitting uncached pages): look at Cloudflare's analytics for the zone and Security → Events. A rate-limiting rule already covers `/summoner/` and `/match/`: 20 requests per 10 seconds per IP, then blocked for 10 seconds (ADR-065). `/`, `/champions` and its champion pages, `/about` and `/search` are not limited, and the Free plan allows one rule, so a crawler on those pages needs that rule's expression widened or a bot rule ([architecture/concurrency-and-rate-limiting.md](../architecture/concurrency-and-rate-limiting.md)).

## ninja-monitor alerts

ninja-monitor posts to Discord. Its checks on this host, from riot-proxy's notes (`riot-proxy:docs/design/12-object-storage-and-hosting.md:839-845`):

| Alert                                                        | First response                                                                                                                                                                |
| ------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ninjagoldfinch-lol` down (after 30 s; repeats every 30 min) | `systemctl status ninjagoldfinch-lol`; `journalctl -u ninjagoldfinch-lol -n 50`. A start-up `env_invalid` names the bad variable ([troubleshooting.md](./troubleshooting.md)) |
| `ninjagoldfinch-lol` memory over 1 GiB                       | Check traffic and errors; V8 heap growth under load is expected ([deployment/capacity.md](../deployment/capacity.md#memory)); restart if it keeps climbing                    |
| `riot-proxy` down or over 2 GiB                              | riot-proxy's runbook; the site will show errors until it is back                                                                                                              |
| `cloudflared` down or over 512 MiB                           | `sudo systemctl restart cloudflared`; the whole site is unreachable from outside while it is down                                                                             |
| Disk over 70 % / 85 %                                        | [Disk full](#disk-full-on-the-shared-120-gb-volume)                                                                                                                           |
| Host memory below 15 % free                                  | `free -m`, `systemctl status` for each service's memory; riot-proxy's page cache use is normal                                                                                |
| Host CPU over 90 % for 20 min                                | `top`; usually riot-proxy's background jobs                                                                                                                                   |

> **TODO (unverified):** ninja-monitor's alert texts on this host. Its public source (`v0.2.3`) formats an alert as `**FIRING** [<host>] <rule name>: …` and `**RESOLVED** …` (`ninja-monitor:README.md:343-347`), but the rules set on `ngf-prod-syd1` are known only from riot-proxy's notes; neither repository contains its configuration. Whether anything probes `/healthz` from outside, and what it does when that fails, is in [integration/monitoring-hooks.md](../integration/monitoring-hooks.md#from-outside-the-heartbeat-to-healthchecksio).

---

**Sources:** owner-supplied unit (inventory section 14), `README.md:L84-L114,L186-L196`, `deploy/systemd/ninja-deploy.conf:L1-L15`, `src/routes/healthz/+server.ts:L6-L9`, `src/lib/server/proxy.ts:L13-L20,L124-L131`, `src/lib/server/errors.ts:L16-L33`, `src/hooks.server.ts:L21-L54`, `docs/deployment/releases.md:L1-L13,L84-L122,L169-L216`, `docs/_meta/gaps.md`, `docs/DECISIONS.md` (ADR-045, ADR-053, ADR-062 to ADR-065), `riot-proxy:docs/design/12-object-storage-and-hosting.md:L839-L845` (riot-proxy at `7531561`), `ninja-actions:infra/deploy.sh:L1-L22,L125-L140`, `ninja-actions:infra/deploy-host-add.sh:L1-L4,L42,L169-L180,L196-L204` (at `1da68ac`), `ninja-monitor:README.md:L343-L347` (`v0.2.3`); observed with the production build and riot-proxy v2.7.0 on 2026-10-20 (refused connection, hung socket, invalid consumer key, invalid Riot key), `docs/PROGRESS.md` ("P5-05 check")
**Last verified:** 2026-11-09 against commit `4986766`
