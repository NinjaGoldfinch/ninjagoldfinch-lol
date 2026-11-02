# RV plan: fixes from the code review of 2026-11-03

The owner asked for an extensive review of the code and docs on 2026-11-03, then for the changes to be made. One task, one branch from `origin/main`, one PR, squash-merged once `just check` (and `just e2e` where a page changes) passes. The page-speed items the review raised (starting the patch and static-data calls alongside the main calls) are SPD-08's and stay there.

## RV-01: the deploy test cannot touch the real repo

`deploy/proxmox/test.sh` runs from the pre-push hook. Git exports `GIT_DIR` (and, from a worktree, more) to hooks, so the test's `git init`, `commit` and `tag` on its scratch repos acted on the real one (2026-10-09). Unset every `GIT_*` location variable at the top. Test: run the script with `GIT_DIR` pointing at a scratch repo and check that repo's refs are unchanged.

## RV-02: Riot IDs are checked before they reach riot-proxy

`parseRiotId` accepts `..` as a game name. openapi-fetch encodes slashes but not dots, so `/summoner/..-x` asks riot-proxy for `/v1/players/x/profile`, key attached. Reject `.` and `..` names and tags, and hold both to the spec's lengths. The proxy client also refuses a request whose resolved path differs from the one it built.

## RV-03: every outbound call has a deadline that fires

- `withTimeout` builds its deadline from `AbortSignal.timeout` and `AbortSignal.any`; a page against a hung riot-proxy once never finished, and the unit test times out now and then (`docs/_meta/gaps.md`). Use an `AbortController` with a `setTimeout` cleared in `finally`.
- A refused connection or a DNS failure is a 500 today, though the comment says 503. Anything but the caller's own abort is a 503.
- The CommunityDragon fetch has no deadline and every match page for the patch waits on it: 5 s.
- `findChampionPage` turns a riot-proxy 429 from the static data into a 503; keep the 429.
- The failure log calls a timeout "unreachable"; say "timeout".

## RV-04: Cache-Control on every response

- A data request whose load threw answers 200 with the error inside, and a redirect thrown before `setHeaders` carries no header: neither gets `Cache-Control`. A response without one gets `no-store`.
- A match page whose names or CommunityDragon data fell back is cached for up to two days; a champions page for 10 minutes. A degraded page is not cached.
- `/champions/[key]` tidies its query with a 308, which browsers keep for good. 308 for the slug only; 307 for the query, as `/champions` does.

## RV-05: lower-case match ids

`/match/oc1_123` passes the route's check, then 404s. Redirect to the upper-case id.

## RV-06: navigation

- The match page's tabs use `data-sveltekit-noscroll`, which SvelteKit 3 ignores; use `data-sveltekit-reset="false"`.
- Recent searches are recorded in `onMount`, which does not run again when one profile links to another.

## RV-07: match and profile edge cases

- `skillOrder` names skills with no points ("QWE" for a remake with only Q).
- The timeline chart divides by a zero duration.
- CS/min with no duration reads "0.0"; show a dash.
- The champion summary's "From N matches" counts remakes it leaves out.
- A wait from `retryAfter` can read "2.5 seconds"; round up.

## RV-08: champion page details

- `/champions` says "every tier" and "for this patch and role" with a tier picked.
- `?vs=Syndra` is dropped; compare without regard to case.

## RV-09: dead code and lint

- `package.json`'s `#lib` import names a missing file; `src/lib/index.ts` is the scaffold placeholder.
- `eslint.config.js` ends with an empty scaffold block; add `@typescript-eslint/no-non-null-assertion` to enforce CLAUDE.md.
- Exports used only in their own file: `logFailures`, `withTimeout`, `TIERS`, `parseRank`, `SORTS`, `MATCH_TABS`, `FIXTURES_DIR`.
- Page data nothing renders: `MatchDetail.queueId`, `MatchRow.queueId` and `.patch`, `ChampionSummary.kills`/`.deaths`/`.assists`, `ChampionTable.totalGames` and `.computedAt`, `SetBuilds.opponentId`.
- `package.json` scripts the justfile does not use, including `preview` (ADR-014).
- Comments that no longer match the code.

## RV-10: shared helpers

One definition each for: the static-names fallback (three loaders), `ProxyClient` (six files), item, champion and queue name fallbacks, `titleCase`, the tier order, lane labels (`LANES` out of `assets.ts`), the Riot ID key, the result labels, the number formatter, objective labels and the most damage. `BuildPanel` uses `ItemIcon`.

## RV-11: docs

`docs/IMPLEMENTATION.md` gets a banner (an ADR wins over the plan) and links to CLAUDE.md instead of copying it. The preview VM is dormant in the README, `deploy/proxmox/README.md` and PROGRESS. `just check`'s description lists all of its steps; Node 22.18 everywhere; ADR-038 gets a dated note on the move to ONI-4. `docs/notes/VS-plan.md` is archived; the match-layout note keeps its decision and drops its screenshots.

## RV-12: image and deploy

The Dockerfile's healthcheck reads `PORT` and has a start period; `.dockerignore` leaves out `docs`; `ninjagoldfinch-update` quotes the key path; `.env.example` lists `HOST` and says what reads `ORIGIN`.

## RV-13: tests

A unit test that no fixture holds an `rpx_` or `RGAPI-` key or a real PUUID; static data replaced on a new patch and shared by concurrent callers.
