# Troubleshooting

Symptom, likely cause, how to confirm it, and the fix, for the failures ninjagoldfinch.lol can actually produce. Entries marked **observed** were reproduced on 2026-10-20 with the production build (`node build`) and riot-proxy v2.7.0 or the mock proxy; the rest are read from the code paths cited.

Start from the symptom table, then read the entry.

| #   | Symptom                                                              | Likely cause                                                      |
| --- | -------------------------------------------------------------------- | ----------------------------------------------------------------- |
| 1   | Service exits at start; unit restarting every 2 s                    | Missing or invalid setting                                        |
| 2   | `/healthz` 200, data pages 503 "Temporarily unavailable" at once     | riot-proxy not running                                            |
| 3   | Data pages 503 after exactly 5 s or 30 s                             | riot-proxy hung or overloaded                                     |
| 4   | Every data page 503, journal full of `proxy 401`                     | Wrong or revoked `PROXY_KEY`                                      |
| 5   | Profiles and new matches 503, champion pages fine                    | Riot rejects riot-proxy's Riot key                                |
| 6   | "Too many requests, try again in N seconds"                          | Site quota or Riot budget exhausted                               |
| 7   | Refresh button gives 403                                             | Build `ORIGIN` does not match the public URL                      |
| 8   | A real player's profile shows "Not found"                            | Riot ID typed or linked wrongly, or riot-proxy says not found     |
| 9   | Profile loads, match list says unavailable                           | Optional match-list call failed                                   |
| 10  | Match page without gold chart, item or skill order                   | Timeline call failed (optional)                                   |
| 11  | Match page runes without stat shards                                 | CommunityDragon unreachable                                       |
| 12  | Champion pages 503, profile and match pages fine                     | Data Dragon lookups failing                                       |
| 13  | First view of a champion page slow, `proxy slow … x-cache=MISS`      | Cold analytics slice in riot-proxy                                |
| 14  | Old patch icons or names after a new patch                           | Patch refresh pending, or the new patch's lookups failing         |
| 15  | Requests fail for a few seconds during a deploy                      | Building in the live checkout                                     |
| 16  | e2e: elements "not visible"; text has zero height                    | Chromium system fonts missing                                     |
| 17  | e2e or local page 503/500; mock logs `no fixture for`                | Missing fixture                                                   |
| 18  | Dev server: `ECONNREFUSED 192.168.68.46:8080`                        | `.env` points at the dormant LAN proxy                            |
| 19  | `pnpm install` refuses to run                                        | Node or pnpm version                                              |
| 20  | `status checks failed:` or `riot_proxy check failed:` in the journal | A bug in the status checks or the proxy alarm                     |
| 21  | No events at the receiver, or `event … dropped` in the journal       | `EVENTS_URL` unset or wrong, receiver down, or no state directory |
| 22  | A front-page card shows a notice, or `/` is never cached at the edge | A front-page call failed or its payload was unreadable            |

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

Other messages from the same validators: `PROXY_URL is required, e.g. http://riot-proxy:8080`, `PROXY_URL must be an absolute URL, got "…"`, `… must use http or https, got "…"`, and one for each optional setting that is set wrongly, such as `STATUS_TOKEN must be at least 16 characters…` or `STATE_DIRECTORY must be an absolute path…`; for `EVENTS_URL` the value is not shown, as it may hold a token (`src/lib/server/env.ts:11-161`). `EADDRINUSE` means something else holds `PORT`.

**Fix.** Correct `/etc/ninjagoldfinch-lol/env` ([deployment/configuration.md](../deployment/configuration.md)), then `sudo systemctl restart ninjagoldfinch-lol`. For `EADDRINUSE`, `sudo ss -ltnp | grep ':3000 '`.

## 2. Data pages 503 at once, `/healthz` fine

**Cause.** riot-proxy is not listening. The connection is refused; the proxy client logs `proxy unreachable` and fails the call as 503, "Temporarily unavailable" (`src/lib/server/proxy.ts:126-130`). **Observed** on 2026-10-20, before RV-03: `/champions`, `/summoner/…`, `/match/…` answered in under 0.05 s, then with status 500; RV-03 made it 503.

**Confirm.**

```sh
sudo journalctl -u ninjagoldfinch-lol --since '-5 min' | grep 'proxy unreachable'
# proxy unreachable GET /v1/lol/analytics/champions: TypeError: fetch failed  … ECONNREFUSED 127.0.0.1:8080
systemctl status riot-proxy
```

**Fix.** Start or repair riot-proxy ([runbook.md](./runbook.md#riot-proxy-down-or-hung)). Check `PROXY_URL` is `http://127.0.0.1:8080`.

## 3. Data pages 503 after 5 s or 30 s

**Cause.** riot-proxy accepts connections but does not answer in time. Each call has a deadline: 5 s for `/v1/lol/analytics/*` and `/v1/static/*`, 30 s for player and match routes; a spent deadline is a 503 (`src/lib/server/proxy.ts:70-136`, ADR-040). **Observed**: `/champions` 503 at 5.02 s; `/match/…` and `/summoner/…` 503 at 30.0 s. Before RV-03 a call's deadline could fail to fire, and one match page never finished; that was fixed ([architecture/concurrency-and-rate-limiting.md](../architecture/concurrency-and-rate-limiting.md#deadlines-and-failures)).

**Confirm.** `proxy timeout GET <path> after 5000 ms` (or `30000 ms`) in the journal; `curl -s -m 5 http://127.0.0.1:8080/readyz` hangs or is slow.

**Fix.** riot-proxy's side (load, SQLite lock, a stuck job). Restarting riot-proxy usually clears a hang.

## 4. Every data page 503 with `proxy 401`

**Cause.** riot-proxy does not recognise `PROXY_KEY`: wrong value, revoked, or a key from another riot-proxy. **Observed**: `/champions` and `/summoner/…` 503; journal `proxy 401 GET /v1/lol/analytics/champions request-id=…`; riot-proxy logs `rejected unknown key` with the same `request_id`.

**Confirm.**

```sh
sudo journalctl -u ninjagoldfinch-lol --since '-10 min' | grep -c 'proxy 401'
sudo journalctl -u riot-proxy | grep '<request-id from the site line>'
```

**Fix.** Issue a new read key and put it in the env file ([integration/authentication.md](../integration/authentication.md#issue-a-key)), then restart the site.

## 5. Profiles and new matches 503, champion pages fine

**Cause.** riot-proxy cannot use its Riot key (expired, suspended or wrong). riot-proxy answers `UPSTREAM_ERROR` 502 "Upstream authentication failed" for calls that need Riot; the site maps that to 503 (`src/lib/server/errors.ts:32`). Analytics, static data and archived matches do not call Riot, so they keep working. **Observed** with a placeholder Riot key.

**Confirm.** `proxy 502 GET /v1/players/by-riot-id/… request-id=…` in the site's journal; riot-proxy's log for that id.

**Fix.** Renew the Riot key on riot-proxy (`RIOT_API_KEY`), restart riot-proxy ([runbook.md](./runbook.md#riot-outage-or-riot-key-suspended)).

## 6. "Too many requests"

**Cause.** riot-proxy answered `QUOTA_EXCEEDED` (this site's consumer quota, 600/min by default, shared by all visitors) or `RATE_LIMITED` (Riot's budget, sent by riot-proxy as HTTP 503), or any 429. The page shows the `retryAfter` seconds from the body or `Retry-After` header (`src/lib/server/errors.ts:24-30,76-84`).

**Confirm.** `grep -E 'proxy (429|503)'` in the journal, then the request id in riot-proxy's log to see which code.

**Fix.** `QUOTA_EXCEEDED`: find the client generating uncached traffic (Cloudflare analytics) and block or rate-limit it; or raise the key's quota on riot-proxy. `RATE_LIMITED`: wait; it is the Riot key's limit ([deployment/capacity.md](../deployment/capacity.md#the-real-throughput-limit-riot-proxy-and-the-riot-key)).

## 7. Refresh gives 403

**Cause.** SvelteKit refuses a form POST whose `Origin` is not the origin baked in at build time. A build without `ORIGIN=https://ninjagoldfinch.lol` guesses the origin from the `Host` header (`vite.config.ts:30-33`, ADR-014). **Observed**: a POST with a foreign `Origin` got 403; with the build's origin it went through.

**Confirm.** `curl -s -o /dev/null -w '%{http_code}\n' -X POST -H 'Origin: https://ninjagoldfinch.lol' -H 'content-type: application/x-www-form-urlencoded' 'http://127.0.0.1:3000/summoner/<id>?/refresh'`: anything but 403 means the origin is right.

**Fix.** Rebuild with `env ORIGIN=https://ninjagoldfinch.lol pnpm build` and restart ([deployment/upgrade-and-rollback.md](../deployment/upgrade-and-rollback.md#upgrade)).

## 8. A real player shows "Not found"

**Causes.**

- The URL segment is split on the **last** hyphen: `/summoner/Game-Name-TAG` is `Game-Name` `#` `TAG` (`src/lib/domain/riot-id.ts:14-19,51-60`). A missing tag gives 404 without calling riot-proxy.
- riot-proxy answered `NOT_FOUND` or `VALIDATION` (`src/lib/server/errors.ts:19-22`).
- riot-proxy named a platform the site has no region for: that is a 503, logged as `profile <Name>#<TAG>: unknown platform <p>` (`src/lib/server/profile.ts:91-95`).

Not-found pages are cached at the edge for 60 s (`src/lib/server/cache.ts:14-15`), so a fix can take a minute to show.

**Confirm.** Use the search box with `Name#TAG`; check the journal for `proxy 404` and the request id.

## 9. Profile loads, match list unavailable

**Cause.** The match-list call is optional: if it fails or times out, the profile header and rank still render (`src/lib/server/profile.ts:97-112`, `src/lib/server/errors.ts:54-58`). riot-proxy's partial-profile warnings are logged as `profile <slug>/<Name>#<TAG> warnings: …` (`src/lib/server/profile.ts:117-119`).

**Confirm.** `grep -E 'proxy .* /v1/players/.*/matches|warnings:'` in the journal.

**Fix.** Usually transient (Riot limits). Persistent failures are riot-proxy's.

## 10. Match page without gold chart, item or skill order

**Cause.** The timeline call is optional; when it fails the scoreboard renders with no gold, objectives or build timeline, and the page is sent `no-store` instead of being cached for a day (`src/lib/server/match.ts:59,71-74`, `src/routes/match/[matchId]/+page.server.ts:17-19`). An unparseable timeline logs `match <id>: unexpected timeline payload`. A match page whose Data Dragon lookups or stat shards failed is not cached either (ADR-045).

**Fix.** Reload later; since the page was not cached, the next request tries again.

## 11. Runes without stat shards

**Cause.** CommunityDragon's `perks.json` could not be fetched; the page leaves the shards out and logs `CommunityDragon stat shards unavailable:` (`src/lib/server/match.ts:47-53`). The fetch has its own 5 s deadline, body included, so a hung CommunityDragon delays a match page by at most 5 s (`CDRAGON_BUDGET_MS`, `src/lib/server/cdragon.ts:12-34`).

**Confirm.** `curl -sI https://raw.communitydragon.org/<major.minor>/plugins/rcp-be-lol-game-data/global/default/v1/perks.json` from the host.

**Fix.** Wait, or point `CDRAGON_URL` at a mirror and restart (`src/lib/server/env.ts:19-27`).

## 12. Champion pages 503, other pages fine

**Cause.** On a champion page the Data Dragon names are essential (they resolve the champion in the URL); elsewhere the site falls back to plain names. Logged as `Data Dragon lookups unavailable:` (`src/lib/server/champion-page.ts:92-97`). A 429 from these lookups stays a 429 page with its wait.

**Confirm.** `curl -s -o /dev/null -w '%{http_code}\n' 'http://127.0.0.1:8080/v1/static/champion?version=<current>'` with the key.

**Fix.** riot-proxy's Data Dragon mirror; once it answers, the next request loads the names.

## 13. Slow first view of a champion page

**Cause.** riot-proxy computes a champion slice on first request after each analytics rebuild: about 200 ms on production, then about 1 ms (ADR-039, `docs/DECISIONS.md:523-529`). The site logs analytics calls over 250 ms as `proxy slow GET <path> x-cache=MISS <ms>ms` (`src/lib/server/proxy.ts:38-68`).

**Confirm.** For this or any other slow page, `sudo journalctl -u ninjagoldfinch-lol | grep 'slow load'` lists each request over 100 ms with its route id and every riot-proxy call it made, by spec path and time, in the form `slow load /champions/[key] <total>ms: …, GET /v1/lol/analytics/champions/{championId} <ms>ms, …`; the slowest call is the one to look at in riot-proxy (`src/lib/server/timing.ts:67-95`, ADR-046).

**Fix.** None on the site. Warming is riot-proxy's (ADR-039).

## 14. Old patch icons after a new patch

**Cause.** The site switches to a new patch in the background (ADR-048). Once the held patch is older than 5 minutes (`PATCH_TTL_MS`), the next request starts a refresh; if riot-proxy's mirror names a new patch, its Data Dragon lookups load first, and pages switch only when they have loaded (`src/lib/server/patch.ts:51-129`). Its CommunityDragon `perks.json` is fetched at the same time but does not hold back the switch; if it is missing, match pages on the new patch show no stat shards (entry 11). So a new patch shows up to 5 minutes, plus the time its lookups take, after riot-proxy mirrors it; riot-proxy itself syncs its mirror hourly. The edge may also still serve pages rendered before.

If the old patch stays well past that, the refresh is failing, and every request after the TTL logs `patch refresh failed; keeping <old patch>:` with the cause: riot-proxy failing `/v1/static/versions`, or failing the new patch's Data Dragon files (a `proxy <status> GET /v1/static/…` line beside it). A missing `perks.json` does not cause this.

**Confirm.** `sudo journalctl -u ninjagoldfinch-lol --since '-30 min' | grep -E 'patch refresh failed|proxy [0-9]+ GET /v1/static'`; then the `curl` from entry 12 with the new version.

**Fix.** For the ordinary delay, wait. For a failing refresh, fix riot-proxy's mirror or static routes; the next request after that switches. A restart moves pages to the new patch at once, because start-up holds the version list without waiting for the lookups; if the new patch's lookups still fail, pages then use plain fallback names, and champion pages fail (entry 12). Purge the edge cache if needed ([runbook.md](./runbook.md#clearing-caches)).

## 15. Errors during a deploy

**Cause.** adapter-node deletes `build/` before writing the new one, while the old process still serves from it ([workflows/release-process.md](../workflows/release-process.md#4-deploy-to-production)).

**Fix.** Run the build and the restart back to back. If a build failed, do not restart; roll back ([deployment/upgrade-and-rollback.md](../deployment/upgrade-and-rollback.md#roll-back)).

## 16. e2e: elements not visible

**Cause.** Chromium's system packages, fonts included, are missing; text lays out at zero height (`README.md:16-17`).

**Fix.** `sudo "$(command -v pnpm)" exec playwright install-deps chromium`.

## 17. `no fixture for` in the mock proxy's output

**Cause.** The page requested a riot-proxy path with no matching fixture; the mock answers 500, which the site shows as 503 (`tests/mock-proxy/mock.ts:38-43`). Paths must match exactly, query string included (`tests/mock-proxy/mock.ts:19-25`).

**Fix.** Record the fixture (`just fixture`) or write a synthetic one ([workflows/testing.md](../workflows/testing.md#fixtures)).

## 18. Dev server: `ECONNREFUSED 192.168.68.46:8080`

**Cause.** `PROXY_URL` in `.env` names the LAN dev proxy, which is dormant. **Observed** on 2026-10-20, including once in a dev server that had been started with a different `PROXY_URL` on the command line ([workflows/development-setup.md](../workflows/development-setup.md#4-run-the-site-locally)).

**Fix.** Set `PROXY_URL` in `.env` to a riot-proxy you run, or to the mock (`http://127.0.0.1:8787`), and restart `just dev`.

## 19. `pnpm install` refuses to run

**Causes.** Node older than 22.18 with `engine-strict=true` (`package.json:7-9`, `.npmrc:1`); or Ubuntu's `node-corepack` 0.24, which cannot load pnpm 12 (`riot-proxy:docs/design/12-object-storage-and-hosting.md:802-804`).

**Fix.** `node --version`; install pnpm with `sudo npm install -g pnpm@12.10.1` ([deployment/install.md](../deployment/install.md#2-pnpm)).

## 20. `status checks failed:` or `riot_proxy check failed:` in the journal

**Cause.** The status checks run in the background every `STATUS_CHECK_INTERVAL_S` (ADR-062). `riot_proxy check failed:` means the probe of riot-proxy's `/readyz` threw something other than the 503 the proxy client makes of no answer or a spent deadline; that round's `riot_proxy` check reads `down`, `unreachable` (`src/lib/server/status.ts:100-113`). `status checks failed:` means a round of checks, or the proxy alarm it hands the `riot_proxy` result to, threw: that round's results may not all be held, so `/api/status` can show the previous round's, and if the round would have raised or cleared the alarm, that event is not sent (`src/lib/server/status.ts:144-166`). The next round runs on time either way. Neither is expected: the probe, the alarm and its record catch their own failures, so both lines are a bug, logged with its stack.

**Confirm.** `sudo journalctl -u ninjagoldfinch-lol | grep -E 'status checks failed|riot_proxy check failed'`, with the stack that follows. Then `curl -s http://127.0.0.1:3000/api/status` on the host: each check's `checked_at` should be within `STATUS_CHECK_INTERVAL_S` (30 s by default) of now.

**Fix.** Report it with the stack. Pages are not affected. If it repeats on every round, `/api/status` stays stale and riot-proxy events stop; roll back to the previous release ([deployment/upgrade-and-rollback.md](../deployment/upgrade-and-rollback.md#roll-back)).

## 21. Events do not arrive

**Cause.** Events go to `EVENTS_URL` on changes of state only: `proxy_unreachable` after 3 failed `riot_proxy` checks in a row, `proxy_recovered` on the first `ok` after it, and `deployed` when a start runs another release than the previous start (ADR-063). Unset, nothing is sent and nothing is logged. Each event gets 5 attempts, about 40 s with the receiver down, then `event <name> dropped after 5 attempts: <error>`; a redirect counts as a failed attempt, so an `EVENTS_URL` that redirects loses every event. More than 64 waiting logs `event <name> dropped: 64 events already waiting`. `deployed`, and keeping the proxy alarm across a restart, need a writable `STATE_DIRECTORY`; without one nothing is logged, and a directory that cannot be read or written logs `could not read <file>:`, `could not record the version in <file>:` or `could not record the alarm in <file>:` (`src/lib/server/events.ts:86-91,140-263`). `event <name> dropped:` alone means sending threw, which is a bug (`src/lib/server/events.ts:260`).

**Confirm.** `sudo journalctl -u ninjagoldfinch-lol | grep -E 'event .* dropped|could not (read|record)'`; `sudo grep -c '^EVENTS_URL=.' /etc/ninjagoldfinch-lol/env` is 1 when a URL is set; `systemctl show ninjagoldfinch-lol -p StateDirectory` names `ninjagoldfinch-lol`.

**Fix.** Set `EVENTS_URL` to the receiver's final URL and restart. For the state directory, see [deployment/releases.md](../deployment/releases.md). A dropped event is not sent again; the status bot's polls of `/api/status` carry the same state.

## 22. A front-page card shows a notice, or `/` is never cached

**Cause.** The front page makes two optional calls to riot-proxy, both with a 2 s deadline (`frontClient`), besides the held patch and lookups: the analytics for the games-analysed pill and the top-win-rate card, and the region's server status (ADR-066, ADR-071; the free rotation was dropped in ADR-076). When one fails, its card shows a notice, the rest of the page is served, and the page is sent `no-store`, so every view of it calls riot-proxy again (ADR-072). Each is logged with a `front page:` prefix (`src/lib/server/front-page.ts:62-140`):

- `front page: analytics unavailable: <status>`, `front page: status unavailable for <platform>: <status>`: riot-proxy answered with an error, or 503 when it did not answer in 2 s, with a `proxy timeout` or `proxy unreachable` line beside it.
- `front page: unexpected status payload for <platform>`: riot-proxy passes Riot's payload through, and Riot's shape changed (ADR-071).
- `front page: patch unavailable:`: no patch or lookups, so no patch pill, no icons and plain names.

`front page: status entries shown with a fallback for <platform>: …` leaves the page cached. It means Riot sent an incident or maintenance without a title or an id: the card shows it as `Incident` or `Maintenance`, not as all clear (ADR-072).

`/?region=me` is not a failure: the Middle East is left out of the front page's regions, because riot-proxy 2.10.0 does not accept its platform `me1`, and the URL redirects to `/` (ADR-072).

**Confirm.** `sudo journalctl -u ninjagoldfinch-lol --since '-30 min' | grep 'front page:'`; for a failed call, the `proxy` line before it names riot-proxy's status and `request-id`. On the host, `curl -sI http://127.0.0.1:3000/` shows `cache-control: no-store` while a card is missing.

**Fix.** A failed call or a timeout is riot-proxy's or Riot's; the next view tries again. An unexpected payload needs the parser in `src/lib/domain/front-page.ts` changed to the new shape; record a fixture of it first (`just fixture`).

---

**Sources:** `src/lib/server/env.ts:L11-L161`, `src/lib/server/proxy.ts:L38-L136`, `src/lib/server/errors.ts:L16-L84`, `src/lib/server/timing.ts:L67-L95`, `src/lib/server/profile.ts:L75-L119`, `src/lib/server/match.ts:L41-L74`, `src/lib/server/champion-page.ts:L86-L99`, `src/lib/server/front-page.ts:L67-L185`, `src/lib/server/errors.ts:L54-L58`, `src/lib/server/patch.ts:L51-L146`, `src/lib/server/cdragon.ts:L12-L34`, `src/lib/server/cache.ts:L14-L15`, `src/lib/domain/riot-id.ts:L14-L19,L51-L60`, `src/routes/match/[matchId]/+page.server.ts:L17-L19`, `src/lib/server/status.ts:L100-L113,L144-L166`, `src/lib/server/events.ts:L86-L91,L140-L263`, `vite.config.ts:L30-L33`, `tests/mock-proxy/mock.ts:L19-L43`, `package.json:L7-L9`, `.npmrc:L1`, `README.md:L16-L17`, `docs/DECISIONS.md:L517-L565,L684-L715`, `riot-proxy:docs/design/12-object-storage-and-hosting.md:L802-L804`; reproductions on 2026-10-20 as described in each entry
**Last verified:** 2026-11-06 against commit `8cbb8c4` (entries 7 and 15 describe the checkout deploy that releases replaced, ADR-054; not re-verified); entry 22 on 2026-11-09 against `a193653`
