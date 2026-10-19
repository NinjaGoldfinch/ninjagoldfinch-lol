# Troubleshooting

Symptom, likely cause, how to confirm it, and the fix, for the failures ninjagoldfinch.lol can actually produce. Entries marked **observed** were reproduced on 2026-10-20 with the production build (`node build`) and riot-proxy v2.7.0 or the mock proxy; the rest are read from the code paths cited.

Start from the symptom table, then read the entry.

| #   | Symptom                                                          | Likely cause                                                  |
| --- | ---------------------------------------------------------------- | ------------------------------------------------------------- |
| 1   | Service exits at start; unit restarting every 2 s                | Missing or invalid setting                                    |
| 2   | `/healthz` 200, data pages 500 "Temporarily unavailable" at once | riot-proxy not running                                        |
| 3   | Data pages 503 after exactly 5 s or 30 s                         | riot-proxy hung or overloaded                                 |
| 4   | A page never loads (Cloudflare 524 from outside)                 | A riot-proxy call whose deadline did not fire                 |
| 5   | Every data page 503, journal full of `proxy 401`                 | Wrong or revoked `PROXY_KEY`                                  |
| 6   | Profiles and new matches 503, champion pages fine                | Riot rejects riot-proxy's Riot key                            |
| 7   | "Too many requests, try again in N seconds"                      | Site quota or Riot budget exhausted                           |
| 8   | Refresh button gives 403                                         | Build `ORIGIN` does not match the public URL                  |
| 9   | A real player's profile shows "Not found"                        | Riot ID typed or linked wrongly, or riot-proxy says not found |
| 10  | Profile loads, match list says unavailable                       | Optional match-list call failed                               |
| 11  | Match page without gold chart, item or skill order               | Timeline call failed (optional)                               |
| 12  | Match page runes without stat shards                             | CommunityDragon unreachable                                   |
| 13  | Champion pages 503, profile and match pages fine                 | Data Dragon lookups failing                                   |
| 14  | First view of a champion page slow, `proxy slow … x-cache=MISS`  | Cold analytics slice in riot-proxy                            |
| 15  | Old patch icons or names after a new patch                       | 5-minute patch hold                                           |
| 16  | Requests fail for a few seconds during a deploy                  | Building in the live checkout                                 |
| 17  | `just check` fails in `proxy.test.ts` with a 5 s timeout         | Flaky test                                                    |
| 18  | e2e: elements "not visible"; text has zero height                | Chromium system fonts missing                                 |
| 19  | e2e or local page 503/500; mock logs `no fixture for`            | Missing fixture                                               |
| 20  | Dev server: `ECONNREFUSED 192.168.68.46:8080`                    | `.env` points at the dormant LAN proxy                        |
| 21  | `pnpm install` refuses to run                                    | Node or pnpm version                                          |

## 1. Service exits at start

**Confirm.**

```sh
systemctl status ninjagoldfinch-lol
sudo journalctl -u ninjagoldfinch-lol -n 30 --no-pager
```

**Observed** output when `PROXY_KEY` is missing with `NODE_ENV=production`:

```text
[SvelteKit error: env_invalid
Invalid environment variables:

PROXY_KEY
  - PROXY_KEY is required when NODE_ENV=production
```

Other messages from the same validators: `PROXY_URL is required, e.g. http://riot-proxy:8080`, `PROXY_URL must be an absolute URL, got "…"`, `… must use http or https, got "…"` (`src/lib/server/env.ts:10-55`). `EADDRINUSE` means something else holds `PORT`.

**Fix.** Correct `/etc/ninjagoldfinch-lol/env` ([deployment/configuration.md](../deployment/configuration.md)), then `sudo systemctl restart ninjagoldfinch-lol`. For `EADDRINUSE`, `sudo ss -ltnp | grep ':3000 '`.

## 2. Data pages 500 at once, `/healthz` fine

**Cause.** riot-proxy is not listening. The connection is refused, the essential call throws, and `handleError` turns it into "Temporarily unavailable" with status 500 (`src/hooks.server.ts:15-20`). **Observed**: `/champions`, `/summoner/…`, `/match/…` 500 in under 0.05 s.

**Confirm.**

```sh
sudo journalctl -u ninjagoldfinch-lol --since '-5 min' | grep -E 'proxy unreachable|^error'
# proxy unreachable GET /v1/lol/analytics/champions: TypeError: fetch failed  … ECONNREFUSED 127.0.0.1:8080
# error GET /champions: TypeError: fetch failed
systemctl status riot-proxy
```

**Fix.** Start or repair riot-proxy ([runbook.md](./runbook.md#riot-proxy-down-or-hung)). Check `PROXY_URL` is `http://127.0.0.1:8080`.

## 3. Data pages 503 after 5 s or 30 s

**Cause.** riot-proxy accepts connections but does not answer in time. Each call has a deadline: 5 s for `/v1/lol/analytics/*` and `/v1/static/*`, 30 s for player and match routes; a spent deadline is a 503 (`src/lib/server/proxy.ts:55-87`, ADR-040). **Observed**: `/champions` 503 at 5.02 s; `/match/…` and `/summoner/…` 503 at 30.0 s.

**Confirm.** `proxy unreachable GET <path>: HttpError { status: 503 … }` in the journal; `curl -s -m 5 http://127.0.0.1:8080/readyz` hangs or is slow.

**Fix.** riot-proxy's side (load, SQLite lock, a stuck job). Restarting riot-proxy usually clears a hang.

## 4. A page never loads

**Cause (suspected).** On 2026-10-20 one match page request against a hung riot-proxy never finished: two of its calls hit their deadline and were logged, a third (`/v1/static/versions`) never logged a timeout. **Observed** once; not root-caused. From outside, Cloudflare gives up first.

**Confirm.** A request still running long after 30 s: `curl -s -m 120 -o /dev/null -w '%{http_code} %{time_total}\n' http://127.0.0.1:3000/<page>`; in the journal, fewer `proxy unreachable … HttpError` lines than the page makes calls.

**Fix.** Restart the site to drop the hung request; fix riot-proxy. The underlying bug needs a code task ([architecture/concurrency-and-rate-limiting.md](../architecture/concurrency-and-rate-limiting.md); gap listed in [\_meta/gaps.md](../_meta/gaps.md)).

## 5. Every data page 503 with `proxy 401`

**Cause.** riot-proxy does not recognise `PROXY_KEY`: wrong value, revoked, or a key from another riot-proxy. **Observed**: `/champions` and `/summoner/…` 503; journal `proxy 401 GET /v1/lol/analytics/champions request-id=…`; riot-proxy logs `rejected unknown key` with the same `request_id`.

**Confirm.**

```sh
sudo journalctl -u ninjagoldfinch-lol --since '-10 min' | grep -c 'proxy 401'
sudo journalctl -u riot-proxy | grep '<request-id from the site line>'
```

**Fix.** Issue a new read key and put it in the env file ([integration/authentication.md](../integration/authentication.md#issue-a-key)), then restart the site.

## 6. Profiles and new matches 503, champion pages fine

**Cause.** riot-proxy cannot use its Riot key (expired, suspended or wrong). riot-proxy answers `UPSTREAM_ERROR` 502 "Upstream authentication failed" for calls that need Riot; the site maps that to 503 (`src/lib/server/errors.ts:32`). Analytics, static data and archived matches do not call Riot, so they keep working. **Observed** with a placeholder Riot key.

**Confirm.** `proxy 502 GET /v1/players/by-riot-id/… request-id=…` in the site's journal; riot-proxy's log for that id.

**Fix.** Renew the Riot key on riot-proxy (`RIOT_API_KEY`), restart riot-proxy ([runbook.md](./runbook.md#riot-outage-or-riot-key-suspended)).

## 7. "Too many requests"

**Cause.** riot-proxy answered `QUOTA_EXCEEDED` (this site's consumer quota, 600/min by default, shared by all visitors) or `RATE_LIMITED` (Riot's budget, sent by riot-proxy as HTTP 503), or any 429. The page shows the `retryAfter` seconds from the body or `Retry-After` header (`src/lib/server/errors.ts:24-30,66-74`).

**Confirm.** `grep -E 'proxy (429|503)'` in the journal, then the request id in riot-proxy's log to see which code.

**Fix.** `QUOTA_EXCEEDED`: find the client generating uncached traffic (Cloudflare analytics) and block or rate-limit it; or raise the key's quota on riot-proxy. `RATE_LIMITED`: wait; it is the Riot key's limit ([deployment/capacity.md](../deployment/capacity.md#the-real-throughput-limit-riot-proxy-and-the-riot-key)).

## 8. Refresh gives 403

**Cause.** SvelteKit refuses a form POST whose `Origin` is not the origin baked in at build time. A build without `ORIGIN=https://ninjagoldfinch.lol` guesses the origin from the `Host` header (`vite.config.ts:16-19`, ADR-014). **Observed**: a POST with a foreign `Origin` got 403; with the build's origin it went through.

**Confirm.** `curl -s -o /dev/null -w '%{http_code}\n' -X POST -H 'Origin: https://ninjagoldfinch.lol' -H 'content-type: application/x-www-form-urlencoded' 'http://127.0.0.1:3000/summoner/<id>?/refresh'`: anything but 403 means the origin is right.

**Fix.** Rebuild with `env ORIGIN=https://ninjagoldfinch.lol pnpm build` and restart ([deployment/upgrade-and-rollback.md](../deployment/upgrade-and-rollback.md#upgrade)).

## 9. A real player shows "Not found"

**Causes.**

- The URL segment is split on the **last** hyphen: `/summoner/Game-Name-TAG` is `Game-Name` `#` `TAG` (`src/lib/domain/riot-id.ts:14-19,35-40`). A missing tag gives 404 without calling riot-proxy.
- riot-proxy answered `NOT_FOUND` or `VALIDATION` (`src/lib/server/errors.ts:19-22`).
- riot-proxy named a platform the site has no region for: that is a 503, logged as `profile <Name>#<TAG>: unknown platform <p>` (`src/lib/server/profile.ts:83-87`).

Not-found pages are cached at the edge for 60 s (`src/lib/server/cache.ts:12-13`), so a fix can take a minute to show.

**Confirm.** Use the search box with `Name#TAG`; check the journal for `proxy 404` and the request id.

## 10. Profile loads, match list unavailable

**Cause.** The match-list call is optional: if it fails or times out, the profile header and rank still render (`src/lib/server/profile.ts:89-104`, `src/lib/server/errors.ts:54-58`). riot-proxy's partial-profile warnings are logged as `profile <slug>/<Name>#<TAG> warnings: …` (`src/lib/server/profile.ts:114-116`).

**Confirm.** `grep -E 'proxy .* /v1/players/.*/matches|warnings:'` in the journal.

**Fix.** Usually transient (Riot limits). Persistent failures are riot-proxy's.

## 11. Match page without gold chart, item or skill order

**Cause.** The timeline call is optional; when it fails the scoreboard renders with no gold, objectives or build timeline, and the page is sent `no-store` instead of being cached for a day (`src/lib/server/match.ts:39,51-54`, `src/routes/match/[matchId]/+page.server.ts:13-15`). An unparseable timeline logs `match <id>: unexpected timeline payload`.

**Fix.** Reload later; since the page was not cached, the next request tries again.

## 12. Runes without stat shards

**Cause.** CommunityDragon's `perks.json` could not be fetched; the page leaves the shards out and logs `CommunityDragon stat shards unavailable:` (`src/lib/server/match.ts:61-64`). The fetch has no timeout of its own (`src/lib/server/cdragon.ts:11-28`).

**Confirm.** `curl -sI https://raw.communitydragon.org/<major.minor>/plugins/rcp-be-lol-game-data/global/default/v1/perks.json` from the host.

**Fix.** Wait, or point `CDRAGON_URL` at a mirror and restart (`src/lib/server/env.ts:17-25`).

## 13. Champion pages 503, other pages fine

**Cause.** On a champion page the Data Dragon names are essential (they resolve the champion in the URL); elsewhere the site falls back to plain names. Logged as `Data Dragon lookups unavailable:` (`src/lib/server/champion-page.ts:91-95`).

**Confirm.** `curl -s -o /dev/null -w '%{http_code}\n' 'http://127.0.0.1:8080/v1/static/champion?version=<current>'` with the key.

**Fix.** riot-proxy's Data Dragon mirror; once it answers, the next request loads the names.

## 14. Slow first view of a champion page

**Cause.** riot-proxy computes a champion slice on first request after each analytics rebuild: about 200 ms on production, then about 1 ms (ADR-039, `docs/DECISIONS.md:521-527`). The site logs analytics calls over 250 ms as `proxy slow GET <path> x-cache=MISS <ms>ms` (`src/lib/server/proxy.ts:23-49`).

**Fix.** None on the site. Warming is riot-proxy's (ADR-039).

## 15. Old patch icons after a new patch

**Cause.** The current patch is held for 5 minutes (`PATCH_TTL_MS`, `src/lib/server/patch.ts:47-68`, ADR-041), and the edge may still serve pages rendered before.

**Fix.** Wait 5 minutes, or restart the site; purge the edge cache if needed ([runbook.md](./runbook.md#clearing-caches)).

## 16. Errors during a deploy

**Cause.** adapter-node deletes `build/` before writing the new one, while the old process still serves from it ([workflows/release-process.md](../workflows/release-process.md#4-deploy-to-production)).

**Fix.** Run the build and the restart back to back. If a build failed, do not restart; roll back ([deployment/upgrade-and-rollback.md](../deployment/upgrade-and-rollback.md#roll-back)).

## 17. `just check` fails in `proxy.test.ts`

**Cause.** "fails a call that never answers once its budget is spent, as unavailable" times out at 5 s intermittently in full-suite runs; it passes alone ([workflows/testing.md](../workflows/testing.md#known-flaky-test)). **Observed**: 3 of 7 full runs.

**Confirm.** `pnpm vitest run tests/unit/proxy.test.ts` passes.

**Fix.** Re-run `just check`. Any other failure is real.

## 18. e2e: elements not visible

**Cause.** Chromium's system packages, fonts included, are missing; text lays out at zero height (`README.md:16-17`).

**Fix.** `sudo "$(command -v pnpm)" exec playwright install-deps chromium`.

## 19. `no fixture for` in the mock proxy's output

**Cause.** The page requested a riot-proxy path with no matching fixture; the mock answers 500, which the site shows as 503 (`tests/mock-proxy/mock.ts:38-43`). Paths must match exactly, query string included (`tests/mock-proxy/mock.ts:19-25`).

**Fix.** Record the fixture (`just fixture`) or write a synthetic one ([workflows/testing.md](../workflows/testing.md#fixtures)).

## 20. Dev server: `ECONNREFUSED 192.168.68.46:8080`

**Cause.** `PROXY_URL` in `.env` names the LAN dev proxy, which is dormant. **Observed** on 2026-10-20, including once in a dev server that had been started with a different `PROXY_URL` on the command line ([workflows/development-setup.md](../workflows/development-setup.md#4-run-the-site-locally)).

**Fix.** Set `PROXY_URL` in `.env` to a riot-proxy you run, or to the mock (`http://127.0.0.1:8787`), and restart `just dev`.

## 21. `pnpm install` refuses to run

**Causes.** Node older than 22.18 with `engine-strict=true` (`package.json:6-8`, `.npmrc:1`); or Ubuntu's `node-corepack` 0.24, which cannot load pnpm 12 (`riot-proxy:docs/design/12-object-storage-and-hosting.md:802-804`).

**Fix.** `node --version`; install pnpm with `sudo npm install -g pnpm@12.10.1` ([deployment/install.md](../deployment/install.md#2-pnpm)).

---

**Sources:** `src/lib/server/env.ts:L10-L55`, `src/lib/server/proxy.ts:L10-L87`, `src/lib/server/errors.ts:L16-L74`, `src/hooks.server.ts:L5-L20`, `src/lib/server/profile.ts:L76-L116`, `src/lib/server/match.ts:L36-L64`, `src/lib/server/champion-page.ts:L86-L97`, `src/lib/server/patch.ts:L47-L68`, `src/lib/server/cdragon.ts:L11-L28`, `src/lib/server/cache.ts:L12-L13`, `src/lib/domain/riot-id.ts:L14-L40`, `src/routes/match/[matchId]/+page.server.ts:L13-L15`, `vite.config.ts:L16-L19`, `tests/mock-proxy/mock.ts:L19-L43`, `package.json:L6-L8`, `.npmrc:L1`, `README.md:L16-L17`, `docs/DECISIONS.md:L515-L563`, `riot-proxy:docs/design/12-object-storage-and-hosting.md:L802-L804`; reproductions on 2026-10-20 as described in each entry
**Last verified:** 2026-10-20 against commit `85d9cf8`
