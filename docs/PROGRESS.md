# Progress

Task ticks with the PR that delivered them. Task definitions are in [IMPLEMENTATION.md](IMPLEMENTATION.md).

## P0 — Repository and tooling

- [x] P0-01 Scaffold with `sv`, Node adapter, Tailwind, Vitest, Playwright, ESLint, Prettier — first commit on `main` (6dc9048), no PR because the repo was empty
- [x] P0-02 Create the private repo and push — no PR; GitHub UI settings are for the owner to apply
- [x] P0-03 `justfile`, `.githooks/`, `.env.example`, `.gitignore`, `.dockerignore` — #1
- [x] P0-04 `README.md`, `docs/DECISIONS.md`, `docs/PROGRESS.md`, `openapi/riot-proxy.json` — #2 (CLAUDE.md and `docs/IMPLEMENTATION.md` came with P0-01)
- [x] P0-05 `src/lib/server/env.ts` and `src/env.ts` with start-up validation and tests — #3

## P1 — Proxy client and site shell

- [x] P1-01 `openapi/riot-proxy.json` (landed in #2), `just gen`, generated types, drift check in `just check` — #6
- [x] P1-02 `src/lib/server/proxy.ts`, `toHttpError`, request-id logging, `hooks.server.ts` error handling — #7
- [x] P1-03 Mock proxy server, fixture recorder (`just fixture`) and first redacted fixtures — #8
- [x] P1-04 Root layout: header, search form, footer with Riot boilerplate, `+error.svelte`, design tokens; region table moved here from P1-05 — #9; light purple accent in place of yellow — #44
- [x] P1-05 `/`, `/about`, `/healthz`; `parseRiotId` with unit tests; `/search` redirect and minimal profile page for the exit check — #10
- [x] P1-06 `src/lib/assets.ts`, `ChampionIcon`, and `currentPatch` from the proxy's versions route — #11

## P2 — Player profile

Exit check (amended in ADR-011): a profile with a page of matches (10) renders in one server response, works without JavaScript, and sends the profile `Cache-Control`. That Cloudflare serves the second request is checked in P5-02.

- [x] P2-01 Profile load: composite profile (account, summoner, rank), first page of 10 matches, current patch; test data from NinjaGoldfinch#OCENZ — #15
- [x] P2-02 `RankBadge` and profile header with data age and refresh cooldown; header search follows the profile's region — #16. Data age from riot-proxy's fetch ages in #32 (ADR-019).
- [x] P2-03 `MatchRow`: champion, spells, KDA, CS/min, items, result, duration, queue, time ago — #17; runes and lane badge — #20; champion level badge — #36; two-row item grid, role quest slot for bot only — #38 (ADR-020); items back in one line, packed left — #39 (ADR-021); trinket in the last slot — #40 (ADR-022)
- [x] P2-04 Queue filter and pagination as query parameters — #18; champion filter from riot-proxy's new `champion` parameter — #33
- [x] P2-05 Champion summary panel from the loaded matches, labelled as such; two-column profile layout — #23
- [x] P2-06 Hide custom-queue matches; cache rules for errors and posts; profile still renders when match history fails — #24

## P3 — Match detail

- [x] P3-01 Match load with timeline; scoreboard for both teams; profile rows link to it — #41 (ADR-023); the profile's own champion highlighted, "Herald" label — #42 (ADR-024); a back link to the profile — #43 (ADR-025)
- [x] P3-02 Builds: item order, skill order, full rune page with stat shards (from CommunityDragon), summoner spells; one player at a time — #45 (ADR-026); repeat buys stacked, no spells or keystone in the panel header — #46 (ADR-027); the build in a popup, other layouts kept in `docs/notes/match-layouts.md` — #47 (ADR-028)
- [x] P3-03 Timeline charts in SVG: gold difference and objective events, in a Timeline tab — #48 (ADR-029); objective strips above and below the chart in place of the "Blue" and "Red" labels, fading fills, end label, a crosshair with JavaScript — #50 (ADR-031)
- [x] P3-04 Expand a match inline from the profile page without a full reload: both teams in the row, from the match page's load — #49 (ADR-030)
- [x] P3-05 One player's build by riot-proxy's definitions (BLD-04): starter, boots, finished items with times, skill order, 18-level grid, shop visits; tested against riot-proxy's golden fixture — #53 (ADR-032); the skill grid grows past 18 points (Triple Tonic) — #57 (ADR-036)

## P4 — Champion analytics

- [x] P4-01 `/champions` table: win, pick and ban rate summed over every tier, sortable without a request, role tabs, patch picker defaulting to all patches — #54 (ADR-033); riot-proxy spec with summed tiers and set builds — #52
- [x] P4-02 `/champions/[key]`: summed rates, set builds in tabs (the detail's lists when there are none), lane matchups, rates by tier; the header search takes a champion's name — #55 (ADR-034)
- [x] P4-03 Every rate shows its games; nothing hidden (`minGames=0` on every analytics route), rates under 100 games marked "Low sample" — #56 (ADR-035)
- [x] P4-04 Search without a region: profiles at `/summoner/Name-TAG` find their platform through riot-proxy, matches at `/match/{matchId}` from the id; old URLs redirect (308) — #59 (ADR-037); riot-proxy spec for SITE-09 — #58

## SPD — speed

- [x] SPD-01 riot-proxy spec v2.6.0 from the release binary, byte-identical to production's `/openapi.json`; slow analytics calls logged with `X-Cache`; LAN dev instance removed from the docs — #62 (ADR-039)
- [x] SPD-02 `patchVersions` held in memory for 5 minutes, shared by concurrent callers, a failure not kept — #64 (ADR-041)
- [~] SPD-03 Dropped on measurement (ADR-039)
- [~] SPD-04 Dropped on measurement (ADR-039)
- [x] SPD-05 A timeout on every riot-proxy call: 5 s for analytics and static data, 30 s otherwise, a 503 when spent; optional calls degrade on a throw as on an error response — #63 (ADR-040)
- [x] SPD-06 Cloudflare's cache of `__data.json`: every page type's `__data.json` goes `MISS` then `HIT` with its page's policy, checked from outside — #95
- [x] SPD-07 Timing for each load, in the server log: one line per request over 100 ms, with each riot-proxy call; cold and warm timings from production in ADR-046 — #86, #87
- [x] SPD-08 Cold-path calls started sooner: the patch and its lookups alongside each page's main call; a cold profile waits for its slower chain — #88, #89 (ADR-047)
- [x] SPD-09 Static data loaded at start-up; the patch refreshed in the background: the first profile after a restart 118 ms against 196 ms, no request waiting on a stale patch — #90, #96 (ADR-048)
- [x] SPD-10 Images fetched sooner: preconnect to the image hosts, the champion header icon eager and first, async decoding — #91
- [~] SPD-11 Dropped: SPD-07's timings put the time in riot-proxy's calls and the lookups, not page size (owner, 2026-11-03; ADR-046, ADR-047)

## VS — tier ranges and builds against a lane opponent

- [x] VS-01 riot-proxy spec v2.7.0 from the release binary; fixtures carry every field the spec requires, checked by a test — #66
- [x] VS-02 Tier filter: `?rank=diamond` one tier, `?rank=diamond+` it and above, Iron to Challenger; all tiers by default — #67 (ADR-042)
- [x] VS-03 Builds against a lane opponent: `?vs=syndra&lane=mid`, a picker from the matchups, matchup rows linking to it, no fallback — #68 (ADR-043)
- [~] VS-04 Dropped: `winRateLow` not used for now (owner, 2026-10-19)

## FIX — fixes

- [x] FIX-01 A bot laner's match row, with its role quest slot, keeps Details beside the items — #65
- [x] FIX-02 The site icon is a ninja goldfinch on a lavender square, replacing the Svelte default — #94
- [x] FIX-03 The site icon is a black-hooded ninja with a lavender eye band on a deep-purple square, visible on dark and light tabs — #97
- [x] FIX-04 The site icon is a lavender N with a dark outline on a deep-purple square — #98

## RV — fixes from the code review of 2026-11-03

- [x] RV-01 The deploy test cannot touch the real repo: every `GIT_*` location variable unset — #73
- [x] RV-02 Riot IDs checked before they reach riot-proxy: no `.` or `..`, the spec's lengths; the proxy client refuses a rewritten path — #74
- [x] RV-03 Every outbound call has a deadline that fires; anything but the caller's abort is a 503; a deadline on CommunityDragon; a 429 kept as a 429 — #75 (ADR-044)
- [x] RV-04 Cache-Control on every response: `no-store` when none is set, degraded pages not cached, 307 for a tidied query — #76 (ADR-045)
- [x] RV-05 Lower-case match ids redirect to upper case — #77
- [x] RV-06 Match tabs keep the scroll; recent searches recorded on every profile — #78
- [x] RV-07 Match and profile edge cases: a zero-length timeline, CS/min without a duration, remakes in the summary count, whole seconds to wait; the skill order kept, as riot-proxy ranks a skill never levelled last — #79
- [x] RV-08 Champion pages: the tier in their wording, `?vs=` without regard to case — #80
- [x] RV-09 Dead code, unused page data and stale comments removed; no non-null assertions, by lint — #81
- [x] RV-10 One definition each for duplicated helpers and labels — #82
- [x] RV-11 Docs brought up to date with the ADRs; finished notes archived — #83
- [x] RV-12 Image and deploy: healthcheck port and start period, quoting, `.env.example` — #84
- [x] RV-13 Tests: no key or real PUUID in the fixtures; static data across patches and concurrent callers — #85

## DEP — releases and deploys through the shared pipeline

Owner request 2026-11-05: the site joins the pipeline riot-proxy and ninja-monitor use (`NinjaGoldfinch/ninja-actions`), with CI on pull requests and semver releases from `v1.0.0`.

- [x] DEP-01 CI runs the gate (`scripts/check.sh`) on every pull request and on `main`; `CLAUDE.md`'s no-CI rule replaced (ADR-050) — #99
- [x] DEP-02 `/healthz` reports the running version, so a deploy waits for the new release (ADR-051) — #100
- [x] DEP-03 a `v*` tag builds a release: the site built for `https://ninjagoldfinch.lol` as a deploy tarball with `version.json`, and `sha256sums` (ADR-052) — #101
- [x] DEP-04 `deploy.yml`: a release to `prod` through `ninja-actions/deploy@v1`, behind the owner's approval (ADR-053) — #102
- [x] DEP-05 release `v1.0.0`, and the production host moved from its checkout to `/srv/ninjagoldfinch-lol` (ADR-054) — #103, #105

## P5 — Production

- [x] P5-03 Security headers on every response through `handle`, a hash-based CSP through SvelteKit's `csp` option, and `/` and `/about` rendered per request with a 10-minute `static` policy (ADR-055) — #107

## Brought forward

- [~] P5-01 (part) `Dockerfile`, `deploy/compose.yaml` and a Proxmox preview VM (`deploy/proxmox/`) for viewing P1 on the LAN — #13. Production runs without Docker (ADR-038), so the rest of P5-01 (`cloudflared`, no published port, and the 200 MB image check) applies only if the Docker preview path comes back. The preview VM is dormant: VM 104 no longer exists (owner, 2026-10-19).
  - Checked on the Proxmox node, 2026-10-09: `create-vm.sh` made VM 104 (`ninjagoldfinch-web`, 192.168.68.47), cloud-init finished, `ninjagoldfinch-update` built the image on the VM, and `http://192.168.68.47:3000` served a profile (NinjaGoldfinch#OCENZ, Oceania) from the dev riot-proxy. Follow-up: `--generate-key`, and README steps using `gh`.
  - `ninjagoldfinch-update` stopped silently on VM 104 after `phase-P2` was moved: `git fetch --tags` refused to clobber the old tag and `-q` hid the message. It now forces and prunes tags, and says when the fetch fails — #37.

## Open decisions resolved

- SvelteKit 3 is stable; scaffolded on 3.x. ADR-001.
- riot-proxy OpenAPI JSON is served at `/openapi.json`. Recorded in the README.
- GitHub does not offer branch protection for this private repo on the current plan. ADR-003.
- Environment handling follows SvelteKit 3 (`src/env.ts`, `$app/env/private`). ADR-004.
- riot-proxy mirrors Data Dragon JSON only, no images; icons load from Riot's Data Dragon CDN, with the patch number taken from the proxy. ADR-009.
- Region picker offers every public LoL platform.

### P0 exit check — passed 2026-10-09

Run on a fresh clone of `main` at 5598c6e in an empty directory.

```text
$ just setup && just check            exit 0
  pnpm install                        Done in 2.5s using pnpm v12.10.1
  git config core.hooksPath .githooks
  [ -f .env ] || cp .env.example .env
  prettier --check                    All matched files use Prettier code style!
  eslint                              no findings
  svelte-check                        346 FILES 0 ERRORS 0 WARNINGS
  vitest run                          Test Files 1 passed (1), Tests 6 passed (6)
  build                               ✔ done (adapter-node)

$ git commit   # staging a file with a test key (`rpx_` followed by `test`)
  on main:      exit 1  pre-commit: refusing to commit on main. Use a task branch and a PR.
  on a branch:  exit 1  pre-commit: staged changes contain what looks like a riot-proxy or Riot API key: leak.txt
```

Tagged `phase-P0`. Paused for owner review before P1.

### P1 exit check — passed 2026-10-09

Production build of `main` at 6805e92 (`node build`), with `PROXY_URL=http://192.168.68.46:8080`, no `PROXY_KEY` and no mock running. Driven in Chromium through Playwright, using one live account lookup.

```text
home page → region "Korea", Riot ID "Hide on bush#KR1" → Search
  final URL   /summoner/kr/Hide%20on%20bush-KR1
  h1          Hide on bush#KR1        (account name from the real dev proxy)
  region      Korea
  direct GET  200, cache-control: public, s-maxage=60, stale-while-revalidate=300
  server log  no proxy failures
```

Gates at the same commit: `just check` passes (53 unit tests); `just e2e` 11 passed against the mock.

Tagged `phase-P1`. Paused for owner review before P2.

Noted for P2: the header's region picker always starts at the default (Oceania) rather than the region of the profile being viewed.

### P2 exit check (amended, ADR-011) — passed 2026-10-09

Production build of `main` at e1ad65e (`node build`, `NODE_ENV=production`, `ORIGIN` set), against the real dev proxy, in Chromium **with JavaScript disabled**.

```text
GET /summoner/oce/NinjaGoldfinch-OCENZ
  status          200 (979 ms, cold Data Dragon lookups)
  cache-control   public, s-maxage=60, stale-while-revalidate=300
  h1              NinjaGoldfinch#OCENZ
  rank            Ranked Solo/Duo · Emerald III 67 LP · 475W 464L · 51%
  match rows      10, all in the one HTML response
  champion panel  4 champions
  older link      /summoner/oce/NinjaGoldfinch-OCENZ?page=2
  data requests   1 document; the rest are module preloads and images
```

Gates at the same commit: `just check` passes (106 unit tests); `just e2e` 22 passed against the mock.

Items that waited on riot-proxy, closed after its changes (ADR-018):

- P2-04 champion filter: riot-proxy's new `champion` parameter — #33.
- P2-02 "Updated N minutes ago": riot-proxy's `fetchedAgeSeconds` — #32 (ADR-019).
- Also from riot-proxy's changes: its schemas for Riot's payloads, and fixtures re-recorded (#31); per-match `ddragonVersion` and the role quest slot (#34).

Still for later: Cloudflare serving the second request is checked in P5-02.

`phase-P2` was first tagged on 2026-10-09 with the two riot-proxy items open, at the owner's request. It was moved on the same day to the commit that closes them.

### P3 exit check — passed 2026-10-10

Production build of `main` at 143ab9c (`node build`, `NODE_ENV=production`, `ORIGIN` set), driven in Chromium through Playwright.

**From a profile row and directly by URL**, against the real dev proxy (auth off, placeholder `PROXY_KEY`):

```text
/summoner/oce/NinjaGoldfinch-OCENZ, JavaScript on → first row's Details link
  link            /match/oce/OC1_712412716?player=NinjaGoldfinch-OCENZ
  requests        the profile document, then the match's __data.json only
  h1              Ranked Solo
  scoreboard      10 player rows
  Timeline tab    ?tab=timeline, chart "Gold difference over 25:22: Red team +10,952 at the end"

GET /match/oce/OC1_712412716?player=NinjaGoldfinch-OCENZ, JavaScript off
  status          200
  cache-control   public, s-maxage=86400, stale-while-revalidate=86400
  h1              Ranked Solo
  scoreboard      10 player rows
  ?tab=timeline   200, 27 gold frames, 21 objectives
```

**Charts against the raw timeline fixture.** The production build against the mock proxy rendered `/match/oce/OC1_712351051?tab=timeline` without JavaScript. Each frame's `<title>` and the objectives table were compared with figures worked out separately, in Python, from `tests/fixtures/timeline-oc1-712351051.json`: per frame, the sum of `totalGold` by team (teams from the match fixture); `ELITE_MONSTER_KILL` credited to `killerTeamId`, and `BUILDING_KILL` to the team other than `teamId`.

```text
gold frames     fixture 34, page 34, mismatches 0
largest leads   Blue +716 at 7:00, Red +8,153 at 32:32 (page: the same)
final lead      Red team +8,153 (page: "Red team +8,153 at the end", end label −8.2k)
objectives      fixture 24, page 24, mismatches 0 (time, team and kind)
per team        Blue 5 towers, 1 Baron, 3 voidgrubs; Red 8 towers, 1 inhibitor,
                4 dragons, 1 Baron, 1 Herald (equal to the match's team objectives)
```

The same comparison against the live match's raw timeline from the dev proxy (served from its archive): 27 of 27 frames and 21 of 21 objectives match.

Gates at the same commit: `just check` passes (199 unit tests); `just e2e` 48 passed against the mock.

Tagged `phase-P3` on the commit that records this check. Paused for owner review before P4.

### P4 exit check — passed 2026-10-10

Production build of `main` at a784835 (`node build`, `NODE_ENV=production`, `ORIGIN` set), against the real dev proxy (auth off, placeholder `PROXY_KEY`), in Chromium **with JavaScript disabled**.

**Every figure traced to riot-proxy.** A script read each figure off the rendered pages and compared it with riot-proxy's response to the same query, fetched directly and worked out independently of the site's code: the summed `stats` row for the header; each set build's `winRate`, `games` and core item ids for its tab; the top `runes`, `spells`, `skillOrder`, `starter` and `boots` of each build, and every 3rd–5th item option (item ids read from the icon URLs, rune and spell names from Data Dragon); every matchup in the builds' role (or the role asked for); every `byTier` row, in ladder order; and every row of the champion table. Each games count was also checked for a "Low sample" mark exactly when under 100 games.

```text
page                          builds  role     matchups  tiers  "Low sample" marks
/champions                         –  –             173 rows, 0 marked (all ≥ 100 games)
/champions?patch=16.20             –  –             171 rows, 171 marked
/champions/ahri                    3  Mid           123      6  132
/champions/ahri?role=mid           3  Mid           123      6  132
/champions/kaisa                   3  Bot            83      6   76
/champions/ahri?patch=16.20        3  Mid            12      2   22
/champions/viego?patch=16.20       3  Jungle         17      3   29

figures compared   885
mismatches           0
cache-control      public, s-maxage=600, stale-while-revalidate=600 on each page
server log         no proxy failures
```

Gates at the same commit: `just check` passes (280 unit tests); `just e2e` 69 passed against the mock.

Since P3, also: the match page's build follows riot-proxy's BLD-04 definitions (P3-05, #53) and its skill grid shows every point taken (#57); search finds a player's region from the Riot ID, and profile and match URLs drop it (P4-04, #59).

Open with riot-proxy: Viego's possession can log skill points he didn't spend. A writeup and a handoff for a Viego-only rule went to riot-proxy on 2026-10-10; the site will mirror the rule once it lands.

Tagged `phase-P4` on the commit that records this check. Paused for owner review before P5.

### SPD-06 check — passed 2026-11-03

From outside (the owner's laptop), against `https://ninjagoldfinch.lol` running `main` at f691710 or later: each URL twice with `curl -s -o /dev/null -D -`, reading `cf-cache-status` and `cache-control`. `__data.json?x-sveltekit-invalidated=01` is the form the browser asks for on client-side navigation.

```text
page                           HTML           __data.json    __data.json?x-sveltekit-invalidated=01   Cache-Control
/champions                     EXPIRED → HIT  MISS → HIT     EXPIRED → HIT                             public, s-maxage=600, stale-while-revalidate=600
/champions/ahri                MISS → HIT     MISS → HIT     MISS → HIT                                public, s-maxage=600, stale-while-revalidate=600
/summoner/NinjaGoldfinch-OCENZ EXPIRED → HIT  MISS → HIT     EXPIRED → HIT                             public, s-maxage=60, stale-while-revalidate=300
/match/OC1_712351051           HIT → HIT      MISS → HIT     MISS → HIT                                public, s-maxage=86400, stale-while-revalidate=86400
```

A `HIT` answered in 70–85 ms. The match's first `__data.json` `MISS` took 12 s at the origin, while riot-proxy was restarting repeatedly that night; a first attempt at the match HTML hung and was stopped. Client-side navigation is served from the edge like the HTML.

### VS exit check — passed 2026-10-19

Production, `main` at eb09022 (#68) deployed by the owner, behind riot-proxy v2.7.0. Its `/openapi.json` has the committed spec's sha256 (`aafca901…088b8`), and a builds rebuild had filled the opponent tables: Ahri's builds against Syndra answered 200, Mid, 404 games, three builds, with the 4th and 5th items, starter and skill order empty as the spec says.

```text
$ curl -sL 'http://127.0.0.1:3000/champions/ahri?rank=diamond+&vs=syndra' | grep -o '[^>]*against Syndra[^<]*'
				build against Syndra
<a href="/champions/ahri?rank=diamond+&amp;vs=syndra&amp;lane=mid#builds" title="Builds against Syndra" …>49.9%
```

The server-rendered page holds the Diamond+ builds against Syndra, and its matchup links keep the rank and the pick. The owner also saw the _vs_ picker in a browser. VS-04 was dropped.

### DEP exit check — passed 2026-11-05

`v1.0.0` (`38df259`, #103) built by `release.yml`: `ninjagoldfinch-lol.tar.gz` passed `SHA256SUMS` and `gh attestation verify`, held `version.json` for that commit and no `node_modules`, and, unpacked away from the checkout, answered `/healthz` with `1.0.0` and served `/champions` and a profile from the mock riot-proxy. The owner moved production to `/srv/ninjagoldfinch-lol` (`docs/deployment/releases.md`), then deployed `v1.0.0` through `deploy.yml` with approval in the `prod` environment ([run 41894530244](https://github.com/NinjaGoldfinch/ninjagoldfinch-lol/actions/runs/41894530244)).

```text
$ curl -fsS http://127.0.0.1:3000/healthz
{"ok":true,"version":"1.0.0"}
$ curl -sI https://ninjagoldfinch.lol/champions | head -1
HTTP/2 200
$ systemctl show ninjagoldfinch-lol -p ExecStart | grep -o '/srv/[^ ;]*'
/srv/ninjagoldfinch-lol/current/build
$ cat /srv/ninjagoldfinch-lol/live.json
{"service":"ninjagoldfinch-lol","env":"prod","version":"v1.0.0","commit":"38df2592fadd409a63ed83e15e697557d24d0782","deployed_at":"2026-11-04T19:12:14Z"}
```

The first check after switching the unit ran before Node listened and saw a 502; the release had started within a second (journal), and the check now waits (#105). The `/opt/ninjagoldfinch-lol` checkout stays as the fallback until releases have settled, and `update-all ninja-lol` is to be retired (step 6 of the move).
