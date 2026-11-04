# Capacity

What ninjagoldfinch.lol needs from the shared `ngf-prod-syd1` (6 vCPU, 12 GB RAM, 120 GB disk, 6 TB/month), how much of that it uses beside riot-proxy, and the signals that it is time to change something. Numbers are labelled **measured** (with where and when) or **estimate**.

## Summary

The site is small next to riot-proxy. It keeps no data, so its disk use is fixed; its memory is one Node process; its bandwidth is HTML through the Tunnel. The limits that matter for the platform are riot-proxy's: its SQLite database on the shared disk, and the Riot key's rate limit, which caps how many uncached profile pages can be served.

## Memory

| Process            | Budget (ninja-monitor alert) | Source                                                            |
| ------------------ | ---------------------------- | ----------------------------------------------------------------- |
| riot-proxy         | 2 GiB                        | `riot-proxy:docs/design/12-object-storage-and-hosting.md:834-835` |
| ninjagoldfinch.lol | 1 GiB                        | same                                                              |
| cloudflared        | 512 MiB                      | same                                                              |
| host               | alert below 15 % free        | `riot-proxy:docs/design/12-object-storage-and-hosting.md:836`     |

The rest of the 12 GB is the kernel's page cache, which riot-proxy's SQLite relies on; ADR-142 chose the host for "RAM for SQLite's page cache and disk room for the archive" (`riot-proxy:docs/DECISIONS.md:1509`).

**Measured** (development machine, 4 cores, Node 22.23.3, production build against the mock proxy, 2026-10-20):

| Condition                                                              | Resident memory (RSS)                                  |
| ---------------------------------------------------------------------- | ------------------------------------------------------ |
| Just started                                                           | 66 MB                                                  |
| After one request to each page type                                    | 95 MB                                                  |
| After 1,600 requests at concurrency 1 and 16                           | 252 MB                                                 |
| After about 26,000 requests                                            | 571 MB, still rising slowly; unchanged after 20 s idle |
| Same load, 24,000 requests with `NODE_OPTIONS=--max-old-space-size=96` | 202–221 MB, flat; no errors                            |

The in-memory lookups (current patch, Data Dragon names and CommunityDragon stat shards) are loaded at start-up, so "Just started" will now include them; that was not re-measured. Since ADR-048 they are held for two patches, the one in use and a new one loading before pages switch to it, which doubles their share for the days after a patch change: a few MB (`src/lib/server/static-data.ts:22-51`, `docs/DECISIONS.md:712`).

The growth without a cap is V8 letting its heap grow, not a leak: with the old-space heap capped at 96 MB the same load ran with flat memory. Node's default heap limit on a 12 GB machine is well above ninja-monitor's 1 GiB alert, so under sustained traffic the process can approach that alert without being in trouble.

> **TODO (unverified):** Production's actual RSS for `ninjagoldfinch-lol` over a day. Read it from ninja-monitor or `systemctl status ninjagoldfinch-lol` (Memory line). If it nears 1 GiB, setting `NODE_OPTIONS=--max-old-space-size=256` in `/etc/ninjagoldfinch-lol/env` would bound it (the 96 MB test above shows the site runs in far less); that is a configuration change to test first.

## CPU

Node serves requests on one thread, so the site uses at most about one of the six vCPUs for rendering.

**Measured** (same machine and setup as above; the mock answers instantly, so this is the site's own rendering cost):

| Concurrency | Throughput | Latency p50 / p95 per page                                                                |
| ----------- | ---------- | ----------------------------------------------------------------------------------------- |
| 1           | 177 req/s  | profile 3.1 / 4.3 ms, match 10.8 / 13.5 ms, champions 4.0 / 5.9 ms, champion 3.7 / 5.8 ms |
| 16          | 234 req/s  | 64–70 ms p50, 85–92 ms p95 (queued on one thread)                                         |

**Measured on production** (ADR-039, 2026-10-15): `/champions` and `/champions/ahri` 8–15 ms with riot-proxy warm; a champion page's first view after an analytics rebuild about 200 ms; through Cloudflare `MISS` 55–69 ms, `HIT` 25–30 ms (`docs/DECISIONS.md:523-529`).

Cached pages never reach the host: the edge serves them for `s-maxage` and `stale-while-revalidate` ([data/caching.md](../data/caching.md)). The host's CPU alert is above 90 % for 20 minutes (`riot-proxy:docs/design/12-object-storage-and-hosting.md:836-837`); riot-proxy's background jobs, not the site, are what would trigger it.

## The real throughput limit: riot-proxy and the Riot key

An uncached profile page or Refresh can make riot-proxy call Riot. The production Riot key is a personal key with 100 requests per 2 minutes (`riot-proxy:docs/DECISIONS.md:1509`). riot-proxy caches Riot responses and reserves a share of each rate-limit bucket for interactive requests ([architecture/concurrency-and-rate-limiting.md](../architecture/concurrency-and-rate-limiting.md)); when it cannot answer in time it returns `RATE_LIMITED` and the site shows 429. The site's own consumer quota defaults to 600 requests a minute (`riot-proxy:src/consumers.rs:14`), and one profile view costs two riot-proxy calls (profile and match list), plus the patch and Data Dragon lookups when they are not already held in memory (`src/lib/server/profile.ts:76-114`). Match and champion pages cost no Riot calls once riot-proxy has the match archived or the analytics computed.

**Estimate:** the site can render hundreds of pages a second; the platform can serve far fewer previously unseen players than that, bounded by the Riot key. Upgrading the Riot key, not the VPS, is the lever for more new-player traffic.

## Disk

**Measured** (fresh clone at `e7c395c`, 2026-10-20):

| Item                                                           | Size                                                             |
| -------------------------------------------------------------- | ---------------------------------------------------------------- |
| `node_modules` (all dependencies, as production installs them) | 181 MB                                                           |
| pnpm content store                                             | 170 MB (hard-linked with `node_modules` on the same file system) |
| `build/`                                                       | 2.9 MB                                                           |
| `.git`                                                         | 8.7 MB                                                           |

So the site needs about 200–400 MB, constant over time, plus the journal. It writes nothing else. Production installs dev dependencies too, because it builds on the host (`README.md:109-110`).

The shared 120 GB is riot-proxy's problem to manage: its database was 22 GB at the move and had doubled in a day, which is why raw bodies moved to object storage (`riot-proxy:docs/DECISIONS.md:1510,1513`). ninja-monitor alerts at 70 % and 85 % disk (`riot-proxy:docs/design/12-object-storage-and-hosting.md:836`).

> **TODO (unverified):** The journal's size limit on the host (`journalctl --disk-usage`, `SystemMaxUse=` in `/etc/systemd/journald.conf`). The site logs only failures and slow calls, so its share should be small.

## Bandwidth

Traffic that counts against the host's 6 TB/month is what crosses its network interface:

| Flow                                       | Crosses the host's link? | Notes                                                                                                                                               |
| ------------------------------------------ | ------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| Browser ↔ Cloudflare                       | No                       | Cloudflare's edge                                                                                                                                   |
| Cloudflare ↔ cloudflared (Tunnel)          | Yes                      | Every response the edge did not have cached                                                                                                         |
| Site ↔ riot-proxy                          | No                       | Loopback                                                                                                                                            |
| Site → CommunityDragon                     | Yes, small               | One `perks.json` per patch, at start-up or when a new patch is found; retried by each match page while it fails (`src/lib/server/cdragon.ts:12-37`) |
| Browser → Data Dragon CDN, CommunityDragon | No                       | Images load from Riot's and CommunityDragon's CDNs directly (`src/lib/assets.ts:9-10`)                                                              |
| riot-proxy ↔ Riot, Onidel, R2              | Yes                      | riot-proxy's; see its documentation                                                                                                                 |

**Measured** page sizes from the production build, uncompressed HTML (2026-10-20, recorded fixtures): profile 62 KB, match 82 KB, `/champions` 140 KB, a champion page 132 KB, `/healthz` 11 B.

**Estimate:** at an average 100 KB per uncached render, one million uncached renders a month is about 100 GB, under 2 % of the allowance, before any compression on the Tunnel. The site is not a bandwidth concern.

## When to act

| Signal                                                               | Likely meaning                                 | Action                                                      |
| -------------------------------------------------------------------- | ---------------------------------------------- | ----------------------------------------------------------- |
| ninja-monitor: `ninjagoldfinch-lol` over 1 GiB                       | V8 heap growth under load (see Memory)         | Check for errors; consider a heap cap; restart if needed    |
| Many 429 pages, `proxy 429`/`503` with `RATE_LIMITED` in the journal | Riot key budget exhausted                      | riot-proxy's problem: Riot key tier, cache TTLs             |
| `proxy slow … x-cache=MISS` lines                                    | Cold analytics slices in riot-proxy            | riot-proxy warming (ADR-039)                                |
| Disk alert at 70 %                                                   | riot-proxy's database or backups               | riot-proxy's runbook; the site cannot free meaningful space |
| CPU alert 90 % for 20 min                                            | riot-proxy jobs, or very high uncached traffic | Check `top`; the edge cache absorbs repeat views            |

---

**Sources:** `riot-proxy:docs/design/12-object-storage-and-hosting.md:L832-L838`, `riot-proxy:docs/DECISIONS.md:L1509-L1513`, `riot-proxy:src/consumers.rs:L14`, `docs/DECISIONS.md:L517-L541,L712`, `README.md:L104-L112`, `src/lib/server/cdragon.ts:L12-L37`, `src/lib/server/static-data.ts:L22-L51`, `src/lib/assets.ts:L9-L10`; measurements on a development machine 2026-10-20 (RSS from `/proc/<pid>/status`, latency with a Python load script, sizes with `curl -w %{size_download}` and `du`)
**Last verified:** 2026-11-03 against commit `a6b406b`
