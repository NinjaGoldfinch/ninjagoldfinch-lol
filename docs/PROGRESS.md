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
- [x] P3-02 Builds: item order, skill order, full rune page with stat shards (from CommunityDragon), summoner spells; one player at a time — #45 (ADR-026); repeat buys stacked, no spells or keystone in the panel header — #46 (ADR-027)
- [ ] P3-03 Timeline charts in SVG: gold difference and objective events
- [ ] P3-04 Expand a match inline from the profile page without a full reload

## Brought forward

- [~] P5-01 (part) `Dockerfile`, `deploy/compose.yaml` and a Proxmox preview VM (`deploy/proxmox/`) for viewing P1 on the LAN — #13. Remaining for P5-01: `cloudflared`, no published port, and the 200 MB image check.
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
