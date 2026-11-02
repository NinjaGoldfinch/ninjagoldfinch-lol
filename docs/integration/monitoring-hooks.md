# Monitoring hooks

What ninjagoldfinch.lol exposes for monitoring: its health endpoint, the log lines it writes, and what ninja-monitor watches. Most of it is small on purpose; gaps are marked.

## Endpoints

| Endpoint       | Exists | Behaviour                                                                                                                           | Source                              |
| -------------- | ------ | ----------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------- |
| `GET /healthz` | yes    | `200 {"ok":true}`, `Cache-Control: no-store`. Liveness only: answers while the Node process serves HTTP, without calling riot-proxy | `src/routes/healthz/+server.ts:5-6` |
| readiness      | no     | Nothing checks that riot-proxy is reachable or the key is accepted                                                                  | —                                   |
| metrics        | no     | No Prometheus or other metrics endpoint                                                                                             | —                                   |

`/healthz` is used by the Docker `HEALTHCHECK` (`Dockerfile:22`), by Playwright to know the server is up (`playwright.config.ts:20`), and by the deploy procedure (`README.md:101`). On production it is reachable only on the host (`curl -s http://127.0.0.1:3000/healthz`) or through the Tunnel at `https://ninjagoldfinch.lol/healthz`.

To check the dependency the site cannot run without, probe riot-proxy's own readiness, `GET http://127.0.0.1:8080/readyz` (200 or 503 with `sqlite`, `limiter` and reader status; no key, no quota) (`riot-proxy:src/routes/health.rs:1,47-106`).

> **TODO (unverified):** a readiness endpoint for the site (for example one that calls riot-proxy's `/v1/static/versions` with the key) does not exist. Decide with the owner whether ninja-monitor should probe one.

## Logs

The site writes plain text lines with `console.error` and `console.warn`; there is no structured or JSON logging and no log level setting. Under systemd they go to the journal (`journalctl -u ninjagoldfinch-lol`, `README.md:100`).

| Line (prefix)                                                          | Level | Meaning                                                                                                                                                                        | Source                                                                                                                           |
| ---------------------------------------------------------------------- | ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------- |
| `Listening on http://<host>:<port>`                                    | info  | adapter-node started (observed at start-up)                                                                                                                                    | adapter-node                                                                                                                     |
| `proxy <status> <METHOD> <path> request-id=<id>`                       | error | riot-proxy answered with a non-2xx status; `<id>` is its `X-Request-Id`                                                                                                        | `src/lib/server/proxy.ts:11-17`                                                                                                  |
| `proxy timeout <METHOD> <path> after <ms> ms`                          | error | The call's deadline (5000 or 30000 ms) expired; the page or section got a 503                                                                                                  | `src/lib/server/proxy.ts:126`                                                                                                    |
| `proxy unreachable <METHOD> <path>: <error>`                           | error | No response for another reason: connection refused, DNS failure, a body that broke off; `<error>` is the original, for example `TypeError: fetch failed … ECONNREFUSED`; a 503 | `src/lib/server/proxy.ts:127`                                                                                                    |
| `proxy slow <METHOD> <path> x-cache=<HIT\|MISS> <ms>ms`                | warn  | An analytics call took over 250 ms                                                                                                                                             | `src/lib/server/proxy.ts:41-62`                                                                                                  |
| `error <METHOD> <path>: <error>`                                       | error | An unexpected exception; the visitor saw "Temporarily unavailable"                                                                                                             | `src/hooks.server.ts:15-19`                                                                                                      |
| `profile <slug>/<Name>#<TAG> warnings: …`                              | error | riot-proxy could not fetch part of a profile                                                                                                                                   | `src/lib/server/profile.ts:113-116`                                                                                              |
| `profile <Name>#<TAG>: unknown platform <p>`                           | error | riot-proxy named a platform the site has no region for                                                                                                                         | `src/lib/server/profile.ts:85`                                                                                                   |
| `match <id>: unexpected payload` / `unexpected timeline payload`       | error | A match or timeline body could not be parsed                                                                                                                                   | `src/lib/server/match.ts:46,53`                                                                                                  |
| `unexpected /v1/static/versions payload`                               | error | No usable current patch                                                                                                                                                        | `src/lib/server/patch.ts:81`                                                                                                     |
| `Data Dragon lookups unavailable…`                                     | error | Static names failed; fallbacks used (or a 503 on champion pages)                                                                                                               | `src/lib/server/profile.ts:109`, `match.ts:58`, `champions.ts:49`, `champion-page.ts:95`, `src/routes/search/+page.server.ts:39` |
| `CommunityDragon stat shards unavailable:`                             | error | `perks.json` failed or took over 5 s; stat shards left out                                                                                                                     | `src/lib/server/match.ts:62`                                                                                                     |
| `analytics patches unavailable:` / `champion <id> <part> unavailable:` | error | An optional analytics call failed                                                                                                                                              | `src/lib/server/champions.ts:46`, `src/lib/server/champion-page.ts:148`                                                          |

The `request-id` value is riot-proxy's, which riot-proxy also records on its request span, so a site error can be found in riot-proxy's JSON logs (`riot-proxy:src/app.rs:107-115`). Profile lines include the Riot ID that was looked up.

## ninja-monitor

ninja-monitor is a separate service; this repo has no code for it. riot-proxy's hosting notes describe its checks on `ngf-prod-syd1` (`riot-proxy:docs/design/12-object-storage-and-hosting.md:832-838`):

| Check                              | Threshold                          |
| ---------------------------------- | ---------------------------------- |
| `ninjagoldfinch-lol` down          | after 30 s, repeating every 30 min |
| `ninjagoldfinch-lol` memory        | limit 1 GiB                        |
| `riot-proxy`, `cloudflared` memory | 2 GiB, 512 MiB                     |
| host memory                        | below 15 % free                    |
| disk                               | above 70 % and 85 %                |
| host CPU                           | above 90 % for 20 min              |

Alerts go to a Discord webhook; its API is reached over an SSH local forward. The systemd unit restarts the site 2 s after any exit (`Restart=always`, `RestartSec=2`, owner-supplied unit), so a crash loop shows as repeated restarts rather than a long outage.

> **TODO (unverified):** how ninja-monitor decides `ninjagoldfinch-lol` is "down" (systemd state, process, or an HTTP probe of `/healthz`). ninja-monitor's repo and config were not available.

## Suggested alert conditions from the logs

These are derived from the log lines above; none is configured anywhere in this repo.

| Condition                                             | Likely cause                                     |
| ----------------------------------------------------- | ------------------------------------------------ |
| Many `proxy unreachable`                              | riot-proxy down                                  |
| Many `proxy timeout`                                  | riot-proxy hung or overloaded                    |
| `proxy 401` or `proxy 403`                            | `PROXY_KEY` revoked, wrong or lacking `read`     |
| `proxy 429` with `QUOTA_EXCEEDED` in riot-proxy's log | The key's `quota_per_min` is too low for traffic |
| Repeated `proxy slow … x-cache=MISS`                  | riot-proxy analytics not warmed after a rebuild  |
| `unexpected … payload`                                | riot-proxy or Riot changed a payload shape       |

---

**Sources:** `src/routes/healthz/+server.ts:L5-L6`, `src/hooks.server.ts:L15-L19`, `src/lib/server/proxy.ts:L11-L62,L124-L128`, `src/lib/server/profile.ts:L85-L116`, `src/lib/server/match.ts:L46-L62`, `src/lib/server/patch.ts:L81`, `src/lib/server/champions.ts:L46-L49`, `src/lib/server/champion-page.ts:L95,L148`, `src/lib/server/cdragon.ts:L21-L32`, `src/routes/search/+page.server.ts:L39`, `Dockerfile:L22`, `playwright.config.ts:L20`, `README.md:L100-L101`, `riot-proxy:src/routes/health.rs:L47-L106`, `riot-proxy:src/app.rs:L107-L115`, `riot-proxy:docs/design/12-object-storage-and-hosting.md:L832-L838`, owner-supplied unit (2026-10-19)
**Last verified:** 2026-11-03 against commit `2948c82`
