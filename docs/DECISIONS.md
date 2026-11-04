# Decisions

Architecture decision records. Newest last.

## ADR-001: Scaffold on SvelteKit 3

Date: 2026-10-09 · Task: P0-01

**Context.** The plan said to start on SvelteKit 2.x and take 3.x only if it was stable. On 2026-10-09, `@sveltejs/kit` 3.0.1 is the npm `latest` tag (3.0.0 released 2026-10-01). `@sveltejs/adapter-node` 6.0.0 and `sv` 1.x were released alongside it.

**Decision.** Scaffold on SvelteKit 3 (`sv@1.1.1`, kit `^3.0.0`, Svelte 5, Vite 8, TypeScript 6).

**Consequences.** Three things in the plan's code samples changed in 3.x:

- `$lib` is removed. Imports use `#lib/...` (Node subpath imports, declared in `package.json`). Include the file extension (`#lib/server/env.ts`); TypeScript does not resolve `#lib` imports without it, although Vite does.
- `svelte.config.js` is no longer supported. Kit config is passed to the `sveltekit()` plugin in `vite.config.ts`.
- `$env/dynamic/private` is deprecated in favour of `$app/env/private`, with variables declared in `src/env.ts`. See ADR-004.

Remote functions are still behind an experimental flag in 3.0.1, so the plan's "no remote functions" rule is unchanged. Node must be 22.17 or later.

## ADR-002: Secret-scan pattern requires a key character after the prefix

Date: 2026-10-09 · Task: P0-03

**Context.** The plan says the pre-commit hook refuses staged content matching `rpx_` or `RGAPI-`. Taken literally, that refuses CLAUDE.md, the plan, the riot-proxy OpenAPI spec and the hook script itself, all of which mention the bare prefixes.

**Decision.** The hook matches `(rpx_|RGAPI-)[A-Za-z0-9_-]` on added lines of the staged diff. It still refuses the exit-check test key and any real key, and allows prose such as `` `rpx_` `` or `rpx_…`.

**Consequences.** `docs/IMPLEMENTATION.md` mentions the exit-check test key on one line, so it went into the first commit, before the hook existed. Because the hook scans added lines only, it refuses an edit to that line. Reword the line if it ever needs changing.

## ADR-003: Branch protection is unavailable, so the local hook is the only guard on main

Date: 2026-10-09 · Task: P0-02

**Context.** The plan asked whether GitHub enforces branch protection on this private repo. `GET /repos/NinjaGoldfinch/ninjagoldfinch-lol/branches/main/protection` returns 403: "Upgrade to GitHub Pro or make this repository public to enable this feature."

**Decision.** Keep the convention from the plan: one task, one branch, one squash-merged PR, enforced locally by the pre-commit hook refusing commits on `main`.

**Consequences.** Nothing on GitHub stops a direct push to `main`. Revisit if the account plan changes.

## ADR-004: Environment variables use SvelteKit 3's `src/env.ts`

Date: 2026-10-09 · Task: P0-05

**Context.** The plan has `src/lib/server/env.ts` read `$env/dynamic/private` and throw at start-up if a variable is missing. SvelteKit 3 deprecates `$env/dynamic/private`. Variables are now declared in `src/env.ts` with `defineEnvVars`, and SvelteKit runs each validator when the server starts and refuses to start if one fails. Validated values are read from `$app/env/private`. `PROXY_KEY` must be optional in development, because the dev riot-proxy runs with auth disabled, and required when `NODE_ENV=production`.

**Decision.**

- `src/lib/server/env.ts` holds the rules as pure functions (`parseProxyUrl`, `parseProxyKey`) with unit tests. It must not import `$app/env/*`: `src/env.ts` imports it, and SvelteKit rejects that cycle.
- `src/env.ts` declares `PROXY_URL` and `PROXY_KEY` using those functions. `PROXY_KEY` is required only when `NODE_ENV=production`, and an empty value counts as unset.
- Validators are skipped while `building`. `vite build` runs them while analysing routes, with `NODE_ENV=production` and without the runtime environment. Without the skip, `just check` would need a real key, and the Docker build (no `.env`) would fail.
- Code reads the values from `$app/env/private`, only under `src/lib/server/`. This replaces the plan's "`$env/dynamic/private` only in `env.ts`" rule.
- No validation library. Plain functions are enough for two variables.

**Consequences.** Verified against the built server (`node build`): with `NODE_ENV=production` it exits at start-up if `PROXY_KEY` is missing or empty, or `PROXY_URL` is missing; it serves with both set, or without `NODE_ENV` and without a key. `ORIGIN` and `PORT` are read by adapter-node itself and are not declared. `PUBLIC_SITE_NAME` will be declared when a page first uses it.

## ADR-005: Keep pnpm's own version out of the lockfile

Date: 2026-10-09 · Follow-up to P0-03

**Context.** Because `package.json` pins `packageManager`, pnpm 12 writes `pnpm-lock.yaml` as two YAML documents: a leading one recording pnpm's own binaries, then the project's dependencies. GitHub's dependency graph reads only the first document. It listed 16 packages, all of them pnpm, so Dependabot alerts covered none of the app's dependencies.

**Decision.** Set `pmOnFail: ignore` in `pnpm-workspace.yaml` and drop the leading document. The project's resolutions are unchanged.

**Consequences.** pnpm itself no longer enforces or switches to the pinned version. Corepack still does: it reads `packageManager` and runs that exact version, here and in the Dockerfile (`corepack enable`). A pnpm installed without corepack runs at whatever version it is, without a warning.

## ADR-006: openapi-fetch for the proxy client; types from openapi-typescript

Date: 2026-10-09 · Task: P1-01

**Context.** The dependency rule asks why hand-written code is not enough for a new runtime dependency.

**Decision.** Add `openapi-fetch` (runtime, about 6 kB, one dependency) and `openapi-typescript` (dev). `just gen` generates `src/lib/api/schema.d.ts` from `openapi/riot-proxy.json`. A hand-written client would have to re-type 61 paths, their parameters and the error envelope, and keep them in step with riot-proxy by hand. With the generated types, a spec change surfaces as type errors.

**Consequences.**

- `openapi-typescript` 7.13 declares a `typescript ^5` peer. It generates correctly under TypeScript 6, so the peer is allowed in `pnpm-workspace.yaml`. Revisit when it declares 6.
- riot-proxy's spec gives Riot's own payloads (account, summoner, league, mastery, match, timeline) no schema, so they come out as `unknown`. The site types the fields it uses by hand, from Riot's published DTOs, and checks them at runtime. This gap is noted for riot-proxy.

## ADR-007: Proxy error mapping and request-id logging

Date: 2026-10-09 · Task: P1-02

**Decision.**

- `toHttpError` (in `src/lib/server/errors.ts`) maps riot-proxy's `ErrorCode`s to three statuses. 404 is not found (`NOT_FOUND`, and `VALIDATION`, since malformed input such as a bad Riot ID cannot name anything). 429 is rate limited (`QUOTA_EXCEEDED` and `RATE_LIMITED`). 503 is unavailable (everything else, including `BAD_REGION`, `UNAUTHORIZED` and `UPSTREAM_ERROR`). The proxy's message is never shown.
- The retry time comes from the error body's `retryAfter`, falling back to `Retry-After`, because those are the fields the spec documents for rate-limit errors. The plan said `X-RateLimit-*`, but those headers describe this site's quota in general, not the wait for a failed request.
- riot-proxy's `X-Request-Id` is logged by an openapi-fetch middleware on the client, not in `hooks.server.ts` as the plan says, because the middleware is the one place that sees every proxy response. `hooks.server.ts` handles SvelteKit 3's `unknown` errors (bugs, an unreachable proxy) by logging them and showing a generic message.
- SvelteKit 3's `App.Error` carries `status`; the site adds an optional `retryAfter`.

## ADR-008: Search goes through a `/search` page; recent searches stay in the browser

Date: 2026-10-09 · Task: P1-05

**Context.** The header search form is on every page and must work without JavaScript. The plan's route table has no search route.

**Decision.**

- The form submits `GET /search?region=…&riotId=…`. A valid `Name#TAG` redirects (303) to `/summoner/{region}/{Name-TAG}`. Anything else re-renders the form with a hint, so a malformed Riot ID never reaches riot-proxy. `GET` keeps it to one request with no form-action or CSRF handling.
- Recent searches on `/` are kept in the visitor's own `localStorage` (up to eight), written when a profile page loads in the browser. The site stores nothing per visitor. Without JavaScript or storage the list is simply absent.
- The P1 profile page makes one call, the regional account lookup. Rank and match history come in P2.

## ADR-009: Images load from Riot's Data Dragon CDN

Date: 2026-10-09 · Task: P1-06

**Context.** The plan's open decision asked whether riot-proxy serves its Data Dragon mirror over HTTP. Per the spec, `/v1/static/{file}` serves Data Dragon's JSON only; no route serves images.

**Decision.** The browser loads champion, item, profile-icon and summoner-spell images directly from `ddragon.leagueoflegends.com/cdn/{patch}/img/…`. `src/lib/assets.ts` is the only place these URLs are built. The patch comes from riot-proxy's `/v1/static/versions` (`current`, or Riot's newest before the first mirror sync), which the proxy answers from its mirror, so it costs no Riot rate limit.

**Consequences.** No image traffic through the VM and no proxy change. The Content Security Policy in P5-03 must allow `img-src https://ddragon.leagueoflegends.com`. CommunityDragon is added to `assets.ts` only when something needs an image Data Dragon lacks.

## ADR-010: A LAN preview VM, built on the VM from a git checkout

Date: 2026-10-09 · Task: P5-01 (part, brought forward)

**Context.** The owner wanted to see P1 running on the Proxmox node before P2, in a VM made the way riot-proxy's is. riot-proxy's VM pulls an image that GitHub Actions publishes. This repo has no CI and no registry.

**Decision.**

- A `Dockerfile` (the plan's, plus `pnpm-workspace.yaml` and `.npmrc` in the install layer and a `/healthz` health check). `deploy/compose.yaml` runs only `web`, publishing port 3000 on the LAN. P5 adds `cloudflared` and stops publishing the port.
- `deploy/proxmox/create-vm.sh`, adapted from riot-proxy's: a Debian 13 cloud image and a cloud-init vendor-data snippet that installs Docker and git, pins GitHub's SSH host keys, makes a deploy key for the VM user, and installs `ninjagoldfinch-update`. The auto-update timer and `--generate-key` are left out.
- The VM clones the private repo with a read-only deploy key (the plan's P5 method) and builds the image itself. `ninjagoldfinch-update [ref]` deploys a branch, tag or commit, so it covers both releases and rollback.
- `.dockerignore` ignores `.env` at any depth, so `deploy/.env` never enters the build context.

**Consequences.** riot-proxy stays on its own VM for now, and `PROXY_URL` points across the LAN. The scripts are covered by `deploy/proxmox/test.sh` in `just check`, but nothing here can exercise Proxmox or Docker. The first real run of the script is on the owner's node.

## ADR-011: Profile data, page size and the P2 exit check

Date: 2026-10-09 · Task: P2-01

**Decision.**

- The profile loads with riot-proxy's composite `/v1/players/by-riot-id/{gameName}/{tagLine}/profile?platform=…`, which returns account, summoner, league and mastery plus `ageSeconds` and `refreshAvailableIn`, in one call. Then `/v1/players/{puuid}/matches` and `/v1/static/versions` run in parallel. That's two round trips per uncached profile.
- **10 matches per page** (riot-proxy's default), not the 20 in the plan's exit check. Each match riot-proxy has not archived yet is its own Riot call, so a cold 20-match profile could cost 21 calls on the shared key.
- A part riot-proxy could not fetch (`warnings`) degrades that section, for example "Rank is unavailable", instead of failing the page. A failed profile or match call fails the page through `toHttpError`.
- **The P2 exit check changes:** "a profile with a page of matches renders in one server response, works without JavaScript, and sends the profile `Cache-Control`". Confirming that Cloudflare actually serves the second request moves to P5-02, where Cloudflare is set up.
- Test data is the owner's account, NinjaGoldfinch#OCENZ on Oceania.

**Noted for riot-proxy (not changed here).**

- The first `/v1/players/{puuid}/matches` call for a player queues an archive backfill with `limit: 4294967295`, effectively the whole history. It runs in the background on the shared Riot key, and every new player the site shows will queue one.
- `MatchSummary.gameVersion` is described as "the Data Dragon version to render it", but it holds the game build (`16.20.824.8524`). The site maps it by `major.minor`.

## ADR-012: Refresh is a POST form action that returns the fresh profile

Date: 2026-10-09 · Task: P2-02

**Context.** riot-proxy's `?refresh=true` re-reads from Riot and spends quota, once a minute per player. Profile pages are cached at the edge (`s-maxage=60`).

**Decision.**

- The Refresh button is a `POST` form to the profile page's `refresh` action, not a link. Crawlers don't submit forms, `POST` is never cached, and it works without JavaScript.
- The action calls `loadProfile` with `refresh: true` (profile and match page) and returns the result. The page renders `form.profile ?? data`, and `use:enhance` skips re-running the load. That way a cached copy of the page, or of its `__data.json`, can't hide what was just fetched.
- The button is disabled while riot-proxy's `refreshAvailableIn` (the larger of the profile's and the match page's) is above zero. With JavaScript the cooldown counts down; without it, the server-rendered value is shown.

**Consequences.** A refreshed page sits at the action URL. Reloading it asks the browser to resubmit the form, and riot-proxy answers from cache inside the cooldown. The P5 Cloudflare cache rule may cache `__data.json` alongside the HTML; refresh doesn't depend on it either way.

## ADR-013: Data Dragon lookups are held in memory for the current patch

Date: 2026-10-09 · Task: P2-03

**Context.** A match row needs Data Dragon's champion IDs (`103` → `Ahri`, for image URLs), item and summoner-spell names, and queue names. riot-proxy mirrors these files, but `item.json` is about 700 kB and `champion.json` about 160 kB. The plan says the site adds no cache of its own.

**Decision.** `src/lib/server/static-data.ts` fetches `champion`, `item` and `summoner` for the current patch, plus `queues`, reduces them to small lookups, and holds them in memory for that one patch. A new patch replaces them, and a failed fetch isn't kept. This bends the no-cache rule only for data that can't change within a patch. Riot player data is still never cached by the site. Measured against the dev proxy: 831 ms for the first profile view after start-up, 56 ms after that.

Queue names come from Riot's descriptions with the team size and "games" removed (`5v5 Ranked Solo games` → `Ranked Solo`), so there is no hand-kept queue table. Names are resolved on the server, so the page carries only the names it shows. Something the patch doesn't know falls back to the name in the match (champions) or `Item 1234` / `Queue 1234`.

Test fixtures for these files are trimmed to the IDs the other fixtures use, with `just fixture <name> <path> --keep id,id,…`.

## ADR-014: The site's origin is set at build time

Date: 2026-10-09 · Task: P5-01 (fix)

**Context.** The plan (and P0's `.env.example`) says adapter-node reads `ORIGIN` at runtime. adapter-node 6 doesn't. SvelteKit 3 takes the origin from `paths.origin` in the build config, and otherwise derives it from the `Host` header, assuming `https`. On the HTTP preview VM, the browser's `Origin: http://192.168.68.47:3000` never matched the derived `https://…`, so every form `POST` (the Refresh button) was refused as cross-site with a 403. The e2e tests missed it because they ran on `vite preview`, which derives the origin correctly.

**Decision.**

- `vite.config.ts` sets `paths.origin` from `ORIGIN` when it is present at build time. `just dev` and local builds without it fall back to the header.
- The Docker build takes `ORIGIN` as a build argument, which `deploy/compose.yaml` passes from `deploy/.env` (required). Changing it means rebuilding, which `ninjagoldfinch-update` always does.
- Playwright now runs the real production server (`pnpm build && node build`, with `ORIGIN` and `NODE_ENV=production`) instead of `vite preview`. Without this fix, the two refresh e2e tests fail on it.

**Consequences.** A cross-origin form `POST` is still refused (checked: 403). The plan's configuration table is out of date on `ORIGIN`: it is now build-time.

## ADR-015: Runes from Data Dragon, lane icons from CommunityDragon

Date: 2026-10-09 · Task: P2-03 (follow-up, owner request)

**Decision.** Match rows show the keystone and secondary rune path, and the lane as a badge on the champion portrait.

- Runes: riot-proxy mirrors `runesReforged.json` (35 kB, added to the per-patch lookups from ADR-013). Rune images come from Data Dragon's unversioned `cdn/img/<path>`.
- Lanes: Data Dragon has no position icons, so they come from CommunityDragon's copy of the client's own, pinned to the patch's `major.minor` (`raw.communitydragon.org/16.20/…/icon-position-middle.png`), as ADR-009 allows for what Data Dragon lacks. Riot's `teamPosition` maps to Top, Jungle, Mid, Bot and Support for the `alt` text. Games without a lane (ARAM, Arena) show no badge.

**Consequences.** The P5-03 Content Security Policy must also allow `img-src https://raw.communitydragon.org`.

## ADR-016: No "updated N minutes ago" until riot-proxy reports fetch time

Date: 2026-10-09 · Task: P2-02 (fix)

**Context.** P2-02 showed "Updated N minutes ago" from the stalest of the profile's `ageSeconds`, as the plan suggested (via `X-Cache-Age`). riot-proxy defines both as how long the **content** has been unchanged, not when it was last fetched. The account part (the Riot ID) almost never changes, so the label climbed forever, even straight after a refresh. The owner saw "Updated 30 minutes ago" on a just-refreshed page; the live proxy reported `account: 1902` seconds.

**Decision.** The profile shows "Updated just now" only when this response's data came from Riot (`refreshed: true` on the profile or the match page, which only a refresh can cause), and otherwise no age. The cooldown is still shown.

**Needed from riot-proxy (not changed here).** A per-part time since the proxy last read that part from Riot, whether or not it changed. For example, `fetchedAgeSeconds` with the same shape as `ageSeconds` on `ProfileBody`, and the equivalent for `MatchPage`'s id list. With that, the header can say "Updated N minutes ago" truthfully, and the plan's data-age requirement can be met.

## ADR-017: Custom games hidden, partial profiles, central cache rules

Date: 2026-10-09 · Task: P2-06

**Decision.**

- **Custom games** (queue 0) are dropped before anything renders, per Riot policy (custom-queue history stays private without the player's opt-in). So is a match with no queue ID, since it can't be shown not to be custom. They never reach the match list or the champion panel, and the list says "Custom games are not shown" without a count. The queue filter never offers queue 0 (P2-04).
- **Only the profile call is essential.** If the match page fails, the page renders the header and rank with a match-history notice ("Too many requests … Try again in 30 seconds"), using the same mapping as `toHttpError`. If the Data Dragon lookups fail, it renders with plain fallbacks. A failed profile call still fails the page.
- **Cache rules are applied centrally** in the `handle` hook, whatever a load set. Form posts and error responses get `no-store`, except 404, which gets `public, s-maxage=60` so repeated misses don't all reach riot-proxy. A profile whose match page failed sets `no-store` itself, so a passing rate limit isn't cached at the edge.
- **Synthetic fixtures** (`tests/fixtures/synthetic-*.json`, each with a `_note`) are allowed for failure states that can't be recorded on demand. They follow riot-proxy's documented shapes, and recorded fixtures stay unedited.

## ADR-018: riot-proxy's own schemas replace the hand-written Riot types

Date: 2026-10-09 · Task: P2 follow-up

**Context.** riot-proxy answered the site's change request (`main`, `:edge`; the spec still says `2.0.0-rc.3`). It now declares Riot's payloads (`AccountDto`, `SummonerDTO`, `LeagueEntryDTO`, `ChampionMasteryDto`, riot-proxy #133) and response headers, and adds `fetchedAgeSeconds`, a `champion` match filter, `ddragonVersion` and `roleBoundItem`.

**Decision.** The committed spec is the dev instance's `/openapi.json` of 2026-10-09. `src/lib/api/riot.ts` uses the generated types and only projects the fields the page shows (`toSummoner`, `toLeagueEntries`). The runtime shape checks from ADR-006 are gone: the spec is the contract for riot-proxy's responses, as for its own routes. ADR-006's hand-typing is superseded for these payloads; match and timeline payloads are still untyped in the spec.

**Consequences.** Fixtures were re-recorded so they carry the new fields. The data was unchanged (same patch, same matches), so the test expectations still hold. Images stay on Riot's CDN and CommunityDragon: riot-proxy's new `/ddragon/…` mirror is only reachable inside the VM in the planned architecture (ADR-009), so using it would mean relaying images through the site.

## ADR-019: "Updated N minutes ago" from riot-proxy's fetch ages

Date: 2026-10-09 · Task: P2-02 (follow-up; supersedes ADR-016)

**Decision.** The profile header shows "Updated N minutes ago" from riot-proxy's new `fetchedAgeSeconds`: the oldest of the **summoner** and **league** parts and the match page's `matchIdsFetchedAgeSeconds`, which is what the page shows. The account part is left out, because riot-proxy re-reads Riot IDs rarely (2.3 hours old against minutes for the rest). Mastery is left out because the page doesn't show it. After a refresh all of them reset to 0, so the header reads "Updated just now". The `refreshed`-only workaround from ADR-016 is gone.

**Consequences.** The text is rendered when the page is built, so a page served from the edge cache can be up to its cache age (60 s, plus up to 300 s stale) older than it says.

## ADR-020: Items in two rows of four; the role quest slot for bot laners only

Date: 2026-10-09 · Task: P2-03 (follow-up) · Layout superseded by ADR-021

**Decision.** `MatchRow` lays a game's items out as two rows of four, as the game's own scoreboard does: item slots 0–2 then the trinket (slot 6) on the first row, slots 3–5 then the role quest slot on the second. So the trinket is always slot 4 and the role quest slot always slot 8. The role quest slot (`roleBoundItem`) is kept only when `teamPosition` is `BOTTOM`, where it holds the bot laner's boots. Other roles' quest rewards (for example the Mid Lane Quest Reward) say nothing useful and are dropped, so their slot 8 stays blank.

**Consequences.** Only bot laners' boots are guaranteed to be in slot 8. Other roles buy boots into the inventory, and they show in whichever slot the player put them. The site does not move them.

## ADR-021: Items in one line, packed left

Date: 2026-10-09 · Task: P2-03 (follow-up; supersedes the layout in ADR-020) · Trinket position superseded by ADR-022

**Context.** The two rows of four from ADR-020 did not fit the match row's layout. Riot reports items by inventory slot, so a sold or used item left an empty square mid-build.

**Decision.** `MatchRow` draws the items in one line, packed left: the six inventory items in slot order, the trinket, then the role quest item, with the empty slots at the end. riot-proxy's showcase does the same. The slot count doesn't change: seven, plus the role quest slot for bot laners. ADR-020's rule that only bot laners keep the role quest slot stands.

**Consequences.** The trinket is no longer at a fixed position: it follows the last item. The row no longer shows which inventory slot an item was in.

## ADR-022: The trinket in a fixed slot at the end of the row

Date: 2026-10-09 · Task: P2-03 (follow-up; supersedes the trinket position in ADR-021)

**Decision.** Only the six inventory items are packed left, with their empty slots after them. The trinket comes next, then the role quest slot when the game has one. So the trinket is always the last slot, or second last for a bot laner, whose boots take the last.

**Consequences.** The trinket lines up down the match list, with any inventory gaps just before it. A game with no trinket shows that slot empty rather than moving an item into it.

## ADR-023: Match page: the match and its timeline, typed by hand, cached for a day

Date: 2026-10-09 · Task: P3-01

**Context.** riot-proxy's match and timeline routes say they pass Riot's match-v5 payloads through unmodified, but give them no schema, so their generated type is `unknown` (ADR-018 left them untyped).

**Decision.**

- `/match/{region}/{matchId}` takes the region's URL slug, as profiles do. A match id must name that region's platform (`OC1_…` for `oce`); anything else is not found without asking riot-proxy, which would answer `BAD_REGION`.
- The load fetches the match, its timeline and `/v1/static/versions` in parallel. `src/lib/api/match.ts` types the fields the site reads from Riot's `MatchDto` and `TimelineDto` and checks them when parsing, as ADR-006 did for the other Riot payloads. A match it can't read fails the page with 503 and a log line. Missing counts read as 0.
- **Custom games** (queue 0, or no queue) are not found, as on the profile (ADR-017).
- **Only the match is essential.** If the timeline fails, the scoreboard still renders, and the page is sent with `no-store` so the gap isn't kept at the edge for a day. The timeline is reduced to each team's gold per frame, about 70 numbers instead of 1.6 MB. Nothing draws it yet: the chart is P3-03.
- Icons use the Data Dragon version for the game's patch: the newest in Riot's version list with the same `major.minor`, the rule riot-proxy documents for `MatchSummary.ddragonVersion`. Names come from the current patch's lookups (ADR-013).
- **Cache:** `public, s-maxage=86400, stale-while-revalidate=86400`. A finished match never changes. So the page shows the start time as a UTC date, not "N hours ago".
- The scoreboard groups players by Riot's `teamId`, 100 as Blue and 200 as Red, and anything else as `Team <id>`. Riot ID links go to that player's profile. Each profile match row links to its match page ("Details"); P3-04 replaces that with an inline view.
- The scoreboard and the profile row share `ItemList` and `Loadout` (spells and runes) and the `loadoutOf` shaping, so ADR-021 and ADR-022's item rules apply on both.
- The fixture recorder now also redacts `summonerId` and a match's `metadata.participants` (a list of puuids). The recorded timeline fixture is 1.6 MB and kept unedited, so P3-03's charts can be checked against it.

**Consequences.** Each match nobody has opened before costs riot-proxy up to two Riot calls (match and timeline), both archived afterwards. Arena's teams of two are untested: there's no recorded Arena match, so how its `teamId`s group is unverified.

**Noted for riot-proxy (not changed here).** Schemas for match-v5's `MatchDto` and `TimelineDto` on the two match routes would replace `src/lib/api/match.ts`'s hand-typing, as #133 did for the account, summoner and league payloads.

## ADR-024: The profile's own champion is highlighted on the match page

Date: 2026-10-09 · Task: P3-01 (follow-up, owner request)

**Decision.**

- A profile's match rows link to `/match/{region}/{matchId}?player=GameName-TAG`, the Riot ID written as in profile URLs. The match page tints that player's line and marks it with an accent bar on the left and `aria-current`. Riot IDs match without regard to case. A link without `player`, or one naming nobody in the game, highlights nothing.
- The page reads `player` from the URL itself, not in the load, so the load's data is the same for every link to a match. The edge caches each URL separately, so each player's link is a separate cache entry.
- The objective label reads "Herald", not "Heralds": a team can take only one Rift Herald a game at present.

**Consequences.** The match is found by the Riot ID it recorded. A player who has changed their Riot ID since the game isn't highlighted in it.

## ADR-025: A back link from the match page to the profile

Date: 2026-10-09 · Task: P3-01 (follow-up, owner request)

**Decision.** A back link above the match page's heading returns to the profile the visitor came from ("← Back to GameName#TAG").

- Without JavaScript it links to the profile named by `player` (ADR-024), on its first page with no filter.
- With JavaScript, when the match was opened from a profile page, the link goes back through the browser's history instead, so that page's filters, page number and scroll position come back. A modified click (new tab or window) follows the plain link.
- With no `player` and no profile page before it, there is no back link.

## ADR-026: Builds, one player at a time; stat shards from CommunityDragon

Date: 2026-10-10 · Task: P3-02

**Decision.**

- The match page has one build panel. It shows the player `?build=` names (a participant id), else the highlighted player (`?player=`, ADR-024), else the first player, normally Blue's top laner. Builds are never stacked. Each champion on the scoreboard links to that player's build (`…&build=N#build`, keeping `player`), and the shown player's champion has an accent ring. The links replace the history entry, so the back link (ADR-025) still leads to the profile.
- Every player's build is in the load's data, about 16 kB of the page, and the page picks one from the URL. So the load is the same for every link, and switching player with JavaScript doesn't reload anything.
- **Item order** comes from the timeline's purchases and sales, grouped by game minute. Sold items are shown faded. Riot's `ITEM_UNDO` names the item in `beforeId` or `afterId`, not consistently by whether a buy or a sale was undone: the recorded match has an undone purchase with `afterId` set. So an undo cancels the player's latest buy or sale of whichever item it names. Items consumed by an upgrade stay in the list, because they were bought.
- **Skill order** is the timeline's `SKILL_LEVEL_UP` events, leaving out `EVOLVE` (Kha'Zix and the like), drawn as a Q/W/E/R grid by level. The heading gives the max order: Q, W and E by when each took its fifth point, with unmaxed skills after, most points first.
- **Runes:** the whole page from the match. Path and rune names come from Data Dragon (ADR-015). Data Dragon's `runesReforged.json` has no stat shards, so their names and icons come from CommunityDragon's `perks.json`, which the owner chose over a hand-kept table. The server fetches it and keeps only the shards (perk ids 5000–5999), held in memory for the current patch like ADR-013. If it fails, the shards are left out and the rest of the page renders.
- **`CDRAGON_URL`** (optional, default `https://raw.communitydragon.org`) is where the server reads CommunityDragon. It lets the e2e tests replay a recorded fixture from the mock, and the planned CommunityDragon mirror replace it with one setting. Browser image URLs (lane icons, stat shards) still use the public host in `assets.ts`. A mirror would change that one constant too.
- The fixture recorder takes a full URL for CommunityDragon, keyed by the URL's path, and `--keep` trims a list by `id`.

**Consequences.** The server now makes one outbound request that doesn't go to riot-proxy: CommunityDragon's `perks.json`, about 100 kB, once per patch. This is data riot-proxy doesn't mirror. The stat shard names are the current patch's, like every other name on the page.

## ADR-027: Build panel: repeat buys stacked; no spells or keystone in its header

Date: 2026-10-10 · Task: P3-02 (follow-up, owner request)

**Decision.**

- The same item bought more than once in one minute, such as two Health Potions at the start, is drawn once, where it first appears, with the count on the icon's corner. Its name reads `2 × Health Potion`. Sales stack the same way, separately from purchases.
- The panel's header shows only the champion and the player. Their summoner spells and keystone are already on the scoreboard line, and the whole rune page is in the panel's rune list.

**Consequences.** The trimmed `static-item` fixture was re-recorded to cover every item bought in the recorded timeline, so the item order shows names rather than `Item N`.

## ADR-028: The build opens in a popup; other layouts kept as notes

Date: 2026-10-10 · Task: P3-02 (follow-up, owner request; supersedes where ADR-026 puts the build)

**Context.** The match page didn't fit on one screen: two team tables and a build panel came to about 1,230 px. Three layouts were mocked up (`docs/notes/match-layouts.md`). The owner chose to keep the stacked team tables and move the build into a popup. Side-by-side teams, with or without the build underneath, are kept as notes, perhaps to offer as a choice later.

**Decision.**

- No build is on the page until one is asked for with `?build=<participant id>`. The champion icons link there, and so does a header link ("Your build" for the highlighted player, otherwise "Builds" for the first player, Blue's top laner). `selectBuild`'s rules from ADR-026 now pick the header link's player.
- **With JavaScript**, those links open the build in a modal `<dialog>` without a reload. SvelteKit's shallow routing (`goto(url, { state, shallow: true })`) updates the URL and records the open build in `page.state.build`. So a copied link reopens it, and Back closes it. Escape, the × button and a click on the backdrop close it too. A popup opened by a click closes by stepping back over its history entry. One opened by loading a `?build=` URL closes by replacing the entry with the page without it. Either way the back link (ADR-025) still leads to the profile. The page behind can't scroll while the popup is open.
- **Without JavaScript**, the server renders the build as an open, non-modal dialog styled into the page below the scoreboards, as before. The × is a link to the page without the build. In the browser the same element is reopened with `showModal()`, and its `:modal` styles make it a popup.

**Consequences.** On a 900 px window the page now ends just below Red's fourth player (1,068 px) instead of 1,230 px. A link to a match no longer shows a build by default.

## ADR-029: Timeline charts in a tab: gold difference and objectives

Date: 2026-10-10 · Task: P3-03

**Context.** The match page fits on about one screen since ADR-028, and the charts needed a place (`docs/notes/match-layouts.md`). The owner chose tabs over a popup or putting the charts below the scoreboards.

**Decision.**

- **Tabs.** Two links under the match header, Scoreboard and Timeline. `?tab=timeline` shows the charts in place of both team tables, and anything else shows the scoreboard. The page reads the tab from the URL, not the load, so the load is the same for every tab, as with `player` (ADR-024). They are plain links, so they work without JavaScript. With it, SvelteKit switches tab without asking the server for anything, because the load doesn't read the URL. The switch replaces the history entry, so the back link's `history.back()` (ADR-025) still leaves the match. Build links and the build's close link keep the tab.
- **Gold difference.** Blue's gold minus Red's at every timeline frame, from the per-team totals ADR-023 kept. It is drawn as a line with the area to zero filled, Blue's colour above zero and Red's below. The y-axis is symmetric, with grid lines every 1k, 2k, 5k, 10k, 20k or 50k: the smallest step that fits the largest lead in three steps. Each side's largest lead and when it was are written above the chart. Hovering a minute shows its lead through SVG `<title>`s, which works without JavaScript. Two tokens, `team-blue` and `team-red`, colour the sides, because `win` and `loss` mean the result, not the side.
- **Objectives** come from the timeline's `ELITE_MONSTER_KILL` (credited to `killerTeamId`) and `BUILDING_KILL` events. A building kill's `teamId` is the team that lost the building, so it is credited to the other team. The kinds are the scoreboard's: towers, inhibitors, dragons, Barons, Herald and voidgrubs. For the recorded match the counts per team equal the scoreboard's, which a unit test checks against the raw fixtures. Other monsters (Atakhan, anything new), turret plates, dragon souls and first blood are not drawn. Names are Riot's in-game ones (`Hextech Drake`, `Mid inner tower`).
- Each team's objectives sit in a lane under the chart, on the same time axis, as a letter (T, I, D, B, H, V). One team's kills of one kind within a minute of the first are one marker with a count, such as three voidgrubs. Markers within 5% of the game's length of each other go on separate rows, so they don't overlap even on a phone. The lanes are hidden from screen readers. Instead, the full list of objectives is a table in a `<details>` below the chart.
- With other than two teams there is no gold difference ("needs two teams") and no building kills, since the team that took a building is unknown. Without a timeline the tab says it is unavailable.
- Hand-written SVG and HTML, with no chart library, as the plan says.

**Consequences.** The page's data gains the objective list, about 24 entries (2 kB) for a 32-minute game. Arena is still untested: there is no recorded Arena match.

## ADR-030: A profile row shows both teams in place, from the match page's own load

Date: 2026-10-10 · Task: P3-04

**Context.** P3-04 expands a match inline on the profile page without a full reload. CLAUDE.md rules out client-side fetching of proxy data, so the owner chose how the row gets its data, and what it shows.

**Decision.**

- **With JavaScript**, each match row has a button under its Details link ("Show the teams", `aria-expanded`). It opens a compact view of both teams inside the row: one line per player with champion, Riot ID (a link to their profile), KDA, a damage bar and items. The profile's player is highlighted as on the match page (ADR-024). Both teams are one table, so their columns line up, and it scrolls sideways on narrow screens rather than squeezing the items. Builds and the timeline stay on the match page, one click away through Details.
- **The data is the match page's own load**, through SvelteKit's `preloadData(matchPath(…))`. That is the request a client-side navigation to the match page makes (`__data.json`), so the browser only ever asks the site, never riot-proxy, and nothing new runs on the server. The response carries the match page's Cache-Control (a day at the edge, ADR-023), so an expanded match is served from Cloudflare like the page. `asMatchDetail` checks that the data is the detail of the match asked for. The row keeps it, so hiding and showing again asks for nothing.
- If the match can't be loaded (an error page's data, a network failure), the row says so and links to the match page.
- **Without JavaScript** there is no button; the Details link goes to the match page as before. The button is added once the page has hydrated, so no control is ever shown that does nothing.
- The URL doesn't change when a row expands.

**Consequences.** Expanding a row downloads the whole match page's data, builds and timeline gold included: 34 kB before compression for the recorded ranked game, though the inline view uses only the teams. A slimmer route would mean a second server load for the same match, so it is left as is. Two synthetic fixtures make the profile's second match fail, for the error state's test.

## ADR-031: Gold chart: Blue's objectives above, Red's below; a crosshair with JavaScript

Date: 2026-10-10 · Task: P3-03

**Context.** In the chart from ADR-029, the two objective lanes under it were labelled "Blue" and "Red" in the y-axis column, so the labels read as part of the gold axis. The owner asked for the labels to go and for the chart to look better overall.

**Decision.**

- Blue's objectives sit in a strip above the chart and Red's in one below, the same way round as their leads. Position and colour tell the sides apart, so the strips have no labels. Blue's rows stack up from the chart and Red's down. The markers are opaque with a surface-coloured ring, so markers that touch on a phone stay legible.
- Each side's area fades from its colour at the edge of the chart to almost nothing at zero, and Blue's leads are filled too. The grid lines other than zero are dashed and quieter. The final lead is a dot on the line, with its value (`−8.2k`) in a gutter to the right.
- With JavaScript, pointing at the chart (or touching it) shows a crosshair and a dot on the nearest frame, with its time and lead. The frame is chosen by `nearestFrame` in `src/lib/domain/timeline.ts`. Without JavaScript, the per-frame SVG `<title>` bands from ADR-029 stay, and they are dropped once the crosshair is available, so the two never show together.
- The key is a row of letter chips (T Tower, I Inhibitor, ...) in place of the line of text, and the time axis reads `5m`, `10m`, ....

**Consequences.** The tooltip is hidden from screen readers, as the lanes are. The chart's accessible name and the objectives table still carry the figures.

## ADR-032: A player's build by riot-proxy's definitions

Date: 2026-10-10 · Task: P3-05 (added after the P3 exit check, owner request; supersedes ADR-026's item order, ADR-027's minute stacks and the max order behind the skill order)

**Context.** riot-proxy now aggregates set builds from archived timelines (BLD-02/03) and has published how one player's build is worked out (BLD-04). It has a reference port in its showcase (`playerBuild`, `shopVisits`, `itemCatalog`) and a golden fixture for the ten players of OC1_711969250. The match page's build (ADR-026) used its own rules: purchases and sales grouped by game minute, and a skill order by when each skill was maxed. The site's player builds would then disagree with the champion pages' set builds (P4-02).

**Decision.**

- `playerBuild` in `src/lib/domain/builds.ts` ports riot-proxy's definitions. It finds the player by puuid in the timeline's `info.participants`, so it parses those and the match's puuids. Puuids are used on the server only and never reach the page. Purchases are `ITEM_PURCHASED` in time order. An `ITEM_UNDO` with `afterId: 0` removes the latest earlier purchase of `beforeId`. Sales, undone sales and destroyed items are ignored. Starter, boots and finished items (the first six, with their times) follow riot-proxy's definitions; `parseItemCatalog` in `src/lib/api/ddragon.ts` reads them from item.json. The skill order is Q, W and E by points at the end, and a tie goes to the skill that reached that count first. Only `NORMAL` level-ups count.
- The panel shows three rows beside the rune page: (1) starter, boots, skill order `Q › W › E`, and finished items with their `mm:ss`; (2) the skill grid, always 18 columns; (3) shop visits. Purchases less than 30 s apart are one visit; that is riot-proxy's display choice, as the timeline has no shop event. Repeat buys within a visit (or in the starter) keep ADR-027's single icon with a count.
- The work runs in the match page's server load, like the rest of the page, rather than in the browser as riot-proxy's showcase does. It uses the same pure functions and the same inputs, so the result is the same.
- The item catalogue comes from the current patch's item.json, the same one that names items (ADR-013). An item it doesn't know is left out of starter, boots and finished items, not guessed; shop visits still show it.
- Without item.json, the panel says item data is unavailable, and the grid and shop visits still show. A player with no purchases and no skill points gets "No build for this player." A failed timeline leaves the rest of the page and the rune page in place, as before.
- `tests/fixtures/builds/` holds riot-proxy's timeline, its cut-down item.json and its golden answers, copied unchanged. `playerBuild` must match all ten players.

**Consequences.** Sales are no longer shown. The player's build and the champion pages' set builds (P4-02) use one definition, so they agree. If riot-proxy changes a definition, its fixtures are copied again and the golden test shows what moved.

## ADR-033: The champion table: summed tiers, all patches by default, sorted in the page

Date: 2026-10-10 · Task: P4-01

**Context.** riot-proxy's `/v1/lol/analytics/champions` now returns one row per champion when no `tier` is named. The row is summed over every tier, and its pick and ban rates are over every match in the slice, each match counted once (SITE-08). Adding up per-tier rows on the site would count a match with players in several tiers more than once, so the owner asked riot-proxy for the summed row rather than summing here or forcing a tier picker. On 2026-10-10 the newest patch held about 1,400 games and all patches together about 210,000.

**Decision.**

- `/champions` asks for Ranked Solo/Duo with no `tier` and no `platform` (every region), and `limit=500` so every champion is listed. Any row that carries a tier is dropped, so per-tier rows can't be shown as summed ones by mistake.
- **Default patch.** `DEFAULT_PATCH` in `src/lib/domain/champion-stats.ts` is `'all'`. It is the only switch: set it to `'newest'` and the bare URL shows riot-proxy's newest patch, and `?patch=all` becomes the explicit choice. The picker lists `/v1/lol/analytics/patches`, newest first. Without that list it offers the default and the patch shown. A patch riot-proxy has no games for shows an empty table, not an error.
- **Role.** Tabs are links with URL values `top`, `jungle`, `mid`, `bot` and `support`, mapped to riot-proxy's `TOP` … `UTILITY`, plus "All roles" (no `role`).
- **Sort.** Pick rate (the default), win rate or ban rate, highest first. A missing rate sorts last, and ties go to more games, then the name. The column headers are links (`?sort=win`) with `aria-sort`. The load reads the sort without tracking it, so with JavaScript a sort changes the URL and sorts in the page without a request. Without JavaScript, the server renders the sorted page.
- **One URL per view.** Defaults and unknown values redirect to the clean URL (`?role=&patch=all` → `/champions`), as the profile does.
- **Names.** Champion names and icon keys come from the current patch's Data Dragon lookups. riot-proxy's `championName` is the fallback, and a champion with no icon key gets an empty box.
- **Cache.** `analytics`: `s-maxage=600, stale-while-revalidate=600`, the plan's 10 minutes. riot-proxy recomputes the tables when a crawl completes.
- The header has a "Champions" link.

**Consequences.** No sample sizes or minimum-games threshold yet; the games column is the raw count, and P4-03 adds the marking. Flex queue, a region picker and champion pages (P4-02) are not part of this task. The match page's tab links use `data-sveltekit-noscroll`, which SvelteKit 3 has renamed (`data-sveltekit-reset="false"`). The champion table uses the new name. The match page is left for a separate fix.

## ADR-034: Champion pages, and a search that takes a champion's name

Date: 2026-10-10 · Task: P4-02

**Context.** riot-proxy serves what a champion page needs in three routes: the detail (`stats` summed over every tier, `byTier`, and the most played items, runes and spells), set builds (BLD-03: the first two finished items, then later steps, starter, boots, skill order, runes and spells) and lane matchups. Its showcase is the reference layout. It also searches champions by name from one box (SITE-10). The owner chose to put that search in this task, and to make the region come from the Riot ID later, in P4-04.

**Decision.**

- **URL.** `/champions/{id}`, where `{id}` is Data Dragon's champion id lower-cased (`/champions/monkeyking`). Any spelling of the id or the display name (`/champions/Wukong`, `/champions/AHRI`) redirects there with a 308, and so do defaults and unknown query values. A champion nobody has data for still has a page; an unknown name is not found.
- **Filters.** The table's role tabs and patch picker (ADR-033), now one component, `AnalyticsFilters`. The patch list is the champion's own (`/v1/lol/analytics/patches?championId=`). The table links each champion to its page, and the page links back, both keeping the role and patch.
- **Loads.** Once the champion is resolved, the detail, set builds, matchups and patch list are fetched in parallel. Only the detail is essential. When the set builds fail, the builds card says so and shows the detail's lists. When the matchups fail, only that card says so.
- **Set builds.** No `role` means riot-proxy picks the champion's most-played role and names it, and builds are never summed across roles. Up to three tabs, each its two core items with win rate and games. Row one has the top keystone and secondary path, spells, skill order (`Q › W › E`), starter and boots. Row two is the item path, `item1 › item2 › 3rd › 4th › 5th`, each later step stacking its options with win rate and games. Tabs are links (`?build=2#builds`), read by the page without the load tracking them, so with JavaScript switching asks the server for nothing, as the table's sort does. With no set builds (no timelines archived for the slice), the card shows the detail's items, runes and spells.
- **Matchups.** For the role asked for; without one, for the set builds' role, and every lane if there is none. Most games first, scrolling inside the card.
- **By tier.** `byTier`, top tier first. `UNKNOWN` is labelled "Unplaced" and comes last, with a note on what it means.
- **Search.** The header box takes a Riot ID or a champion's name. Input with `#` is a Riot ID, as before; anything else is a champion name. Matching follows riot-proxy's showcase (`findChampion` in `src/lib/domain/champion-search.ts`): lower case, accents, spaces and punctuation dropped; display name and Data Dragon id both match; an exact match wins, else a unique prefix. One match redirects to `/champions/{id}#builds`. Otherwise the search page says what matched ("'sy' matches Sylas, Syndra. Keep typing.") or that a Riot ID needs its #TAG. The field is now `q`; `riotId` is still read. The region picker stays until P4-04.
- **Suggestions.** Pages that already hold Data Dragon's names (the champion pages and a search that found nothing) pass the champion names to the header's `<datalist>`. A root layout load would add a proxy call to every page and run at build time for the prerendered `/about`.
- **Cache.** The `analytics` policy (ADR-033).

**Consequences.** Every figure on the page is a field from riot-proxy's response, shown as sent (P4-03's exit check). Low-sample marking is still P4-03's. The home page has no suggestions, since it has no load. The static item fixture gained six items the recorded builds use; its existing entries are unchanged.

## ADR-035: Every row shown, small samples marked

Date: 2026-10-10 · Task: P4-03

**Context.** riot-proxy leaves out analytics rows under `AGGREGATE_MIN_GAMES` (10 on the dev instance) unless a request names `minGames`. Its matchups route has no default, so 1-game matchups were shown while champions under 10 games were not. On the newest patch every champion has under 100 games. The owner chose how many games hide a rate and how many mark it.

**Decision.**

- **Nothing is hidden.** `MIN_GAMES = 0` in `src/lib/domain/champion-stats.ts` is sent as `minGames` on every analytics route the site calls (table, detail, set builds, matchups), so riot-proxy's default doesn't decide what the site shows.
- **Under 100 games is a low sample.** `LOW_SAMPLE_GAMES = 100`. Wherever such a rate appears, it is muted and its games count carries a "Low sample" mark, with a title saying the rates can swing widely. That covers table rows, the champion's header, build tabs, later item options, the fallback lists, matchups and tiers. Each page explains the mark once under its content.
- **Every rate shows its games.** Each rate on the champion pages already sat beside its games count; this task adds no new figure. The build summary (top runes, spells, skill order, starter, boots) shows choices, not rates, so it is not marked.

**Consequences.** On the newest patch almost everything is marked. Over all patches, every champion row in the table clears 100 games, while most matchups and later item options do not. Both thresholds are one constant each.

## ADR-036: The skill grid shows every point taken, past 18

Date: 2026-10-10 · Task: P3-05 (follow-up)

**Context.** The skill grid from ADR-032 always had 18 columns, labelled as champion levels, and put the n-th skill point in column n. Two things break that, as the owner pointed out:

- **Triple Tonic** (rune 8313) grants an extra skill point at level 9. From then on the n-th point is not the n-th level.
- **Udyr** has more ranks between his abilities than he has levels, so with Triple Tonic he can take 19 points. The 19th fell off the grid.

Some champions also start with rank 1 of their R at level 1 and can rank it to 4 (Nidalee, for example), so R points don't always come at 6, 11 and 16. Nothing on the site assumed they did.

**Decision.**

- `skillColumns` in `src/lib/domain/builds.ts` gives at least 18 columns, and one per point past that.
- Columns are numbered by point, in the order taken. The table's caption says "Skill points in the order taken", not "by champion level". Each point's title still gives its time.
- `playerBuild` keeps every `NORMAL` point. Nothing caps points by level, by rank totals, or by R at 6/11/16.

**Consequences.** A Triple Tonic build shows its level-9 points side by side in columns 9 and 10. Viego's possession can still add points he never spent. riot-proxy owns that definition, and a writeup proposing a Viego-only rule has gone to it; the site will mirror the rule once it lands. `skillOrder` still ranks Q, W and E only, per riot-proxy's definition, so Udyr's R isn't ranked; the writeup asks riot-proxy whether it should be.

## ADR-037: The region comes from the Riot ID; URLs drop it

Date: 2026-10-10 · Task: P4-04

**Context.** A League account plays on exactly one platform. riot-proxy now finds it from Riot's account-v1 (SITE-09): its profile routes take `platform` as optional and, without it, name the player's `platform` and `region`. The lookup is cached like an account (24 h soft, 96 h hard), so repeat views cost nothing. Asking visitors for a region was a guess they could get wrong. Every other player route still needs `platform`; riot-proxy's advice is to take it from the profile just loaded. The owner chose to drop the region from profile URLs and, since a Riot match id already names its platform (`OC1_…`), from match URLs too.

**Decision.**

- **Profiles** are at `/summoner/{GameName-TAG}`. The load asks for the profile without `platform`, maps the platform riot-proxy names to the site's region (`regionForPlatform`), and asks for the match page on that platform. A platform the site has no region for is unavailable (503), not guessed. Riot's 404 for an unknown player is still not found.
- **Matches** are at `/match/{matchId}`. The region is the one the id's prefix names (`regionForMatchId`); an id whose prefix names none is not found.
- **Old URLs** (`/summoner/{region}/{GameName-TAG}`, `/match/{region}/{matchId}`) redirect with a 308 to the new ones, keeping the query, so links and bookmarks keep working. Their region is ignored as long as it is one the site knew; otherwise they are not found. An old match URL with the wrong region now opens the match, since its id decides.
- **Search** has no region picker. A Riot ID redirects straight to its profile; the search itself asks riot-proxy nothing.
- **Recent searches** store a Riot ID only. Entries stored with a region are read without it, and a player stored under two regions is kept once.
- **Fixtures.** The profile fixtures were recorded with `?platform=oc1`. Their request paths drop it, with a note: riot-proxy answers the same document without it, which was checked against the dev instance.

**Consequences.** One URL per player, so the edge holds one copy of each profile. The first view of a player costs riot-proxy one account-v1 call. Header search no longer follows a profile's region, since there is nothing to follow. The not-found hint now says to check the #TAG rather than the region.

## ADR-038: Production runs `node build` under systemd, not in Docker

Date: 2026-10-10 · Task: P5-04

**Context.** The plan deploys the site as a Docker container beside `cloudflared` and riot-proxy on a Proxmox VM. Production is instead a small rented server (2 vCPU, 4 GB) that already runs riot-proxy as a plain systemd service, with `cloudflared` installed as a system service. The owner chose to run the site the same way, without Docker on that server. The repo stays private, so the server cannot pull a public image or release.

**Decision.**

- The server keeps a checkout at `/opt/ninjagoldfinch-lol`, pulled with a read-only deploy key, and builds there: `pnpm install --frozen-lockfile`, then `pnpm build` with `ORIGIN=https://ninjagoldfinch.lol` (ADR-014).
- `ninjagoldfinch-lol.service` runs `node build` as its own `ninjagoldfinch-lol` user, with settings from `/etc/ninjagoldfinch-lol/env`. `HOST=127.0.0.1`, so only the tunnel on the same server reaches it.
- The Cloudflare Tunnel routes `ninjagoldfinch.lol` to `http://127.0.0.1:3000`.
- The `Dockerfile`, `deploy/compose.yaml` and `deploy/proxmox/` stay for the LAN preview VM.

**Consequences.** Node 22.18 or later and pnpm must be installed on the server; Ubuntu 26.04's packaged Node is new enough. Deploying is five commands, listed in the README, and none of them is in the repo as a script or unit file yet. The plan's deployment section and P5-01's compose-with-`cloudflared` item describe a setup production does not use.

Note, 2026-11-03: production has since moved to an Onidel ONI-4, ngf-prod-syd1 (6 vCPU, 12 GB, 120 GB).

## ADR-039: Champion pages don't stream; cold slices are riot-proxy's to warm

Date: 2026-10-15 · Task: SPD-01

**Context.** Production's `/champions/__data.json` took 3.9 s on 2026-10-14, nearly all of it riot-proxy's analytics SQL. riot-proxy v2.6.0 keeps analytics responses in memory until the next recompute (`X-Cache: HIT`) and warms the champion table and its patch list after each rebuild, but not the champion pages' four calls. The SPD handoff proposed streaming the optional parts of both champion pages from their server loads, decided by measurement. Measured on the production server:

|                                                                                        | time                                 |
| -------------------------------------------------------------------------------------- | ------------------------------------ |
| riot-proxy, table, patch list, versions (warm)                                         | 0.7–1.4 ms                           |
| riot-proxy, Ahri's detail / builds / matchups / patches, first request after a rebuild | 87 / 76 / 23 / 6 ms, then under 1 ms |
| site, `/champions` and `/champions/ahri` and their `__data.json`, riot-proxy warm      | 8–15 ms                              |
| site, `/champions/zyra` and `/champions/yorick`, first view                            | 198 and 201 ms                       |
| the same pages through Cloudflare                                                      | `MISS` 55–69 ms, then `HIT` 25–30 ms |

The site already fetches a champion page's four calls in parallel. The cold page costs about the sum of the four cold reads (192 ms), not the slowest (87 ms), which suggests riot-proxy computes them one after another or they compete for its two vCPUs. A concurrent check could not confirm it: Zyra's calls were already warm by then.

**Decision.**

- **No streaming.** Warm, every call streaming would defer answers in about 1 ms. On a cold champion page, streaming only the patch list saves nothing, and streaming the builds and matchups too saves at most about 110 ms, once per champion per rebuild, after which the edge holds the page for 10 minutes. Without JavaScript a streamed card never fills in, which CLAUDE.md's "pages work without client JavaScript" rules out for content. SPD-03 and SPD-04 are dropped. (Streaming would still have been server-side loading, so the rule against client-side proxy fetches was never the obstacle.)
- **Cold champion slices are riot-proxy's to warm.** The site does not cache analytics itself; a request to warm the champion pages' four calls for the default view, or to explain the summed cold time, goes to riot-proxy.
- **Slow analytics calls are logged.** A `/v1/lol/analytics/*` call over 250 ms (`SLOW_ANALYTICS_MS`) logs its path, riot-proxy's `X-Cache` and the time, so a cold slice can be told from anything else in the server log. Nothing reaches the browser.
- **The spec comes from riot-proxy's release.** `openapi/riot-proxy.json` is `riot-proxy spec` from the v2.6.0 release binary without its trailing newline, which is byte-identical to production's `/openapi.json`. The LAN dev instance is gone; `PROXY_URL` already had no default in code.

**Consequences.** Since 2.0.0-rc.3 the spec gained optional `side` and `tier` filters on the analytics routes, `side` and `tier` echoed in their responses, the `X-Cache` header, and admin routes; the site uses none of them. Set-build skill orders can now have four letters for Udyr (`RWEQ`), which the page already writes as `R › W › E › Q`. The first view of each champion after a rebuild stays at about 200 ms until riot-proxy warms those calls.

## ADR-040: A deadline on every riot-proxy call; optional calls fail on their own

Date: 2026-10-15 · Task: SPD-05

**Context.** The proxy client had no timeout, so a riot-proxy that stopped answering held the page until Node's socket gave up. A call that threw (riot-proxy unreachable) also failed the whole page through `Promise.all`, even where ADR-017, ADR-023 and ADR-034 say that part is optional; only error responses degraded. riot-proxy's player and match routes can wait on Riot: its client allows 25 s a request with a 10 s connect timeout, retries a 5xx twice, and waits up to 2 s for its rate limiter, so one short deadline for everything would break a profile refresh.

**Decision.**

- **Budgets by route.** `proxyBudget` in `src/lib/server/proxy.ts`: 5 s for `/v1/lol/analytics/*` and `/v1/static/*`, which riot-proxy answers from its own tables, and 30 s for everything else. The client's `fetch` is wrapped so each request carries `AbortSignal.any([its own signal, AbortSignal.timeout(budget)])`, and the body is read inside the wrapper, so the deadline covers the whole exchange. A caller's own abort still works.
- **A spent budget is a 503** with the usual "Temporarily unavailable", the state every other riot-proxy outage shows, thrown with `error()`. The existing `proxy unreachable` log line records it, and the `handle` hook keeps it out of the edge cache.
- **Optional calls survive a throw.** `optional()` in `src/lib/server/errors.ts` turns a thrown call into a 503 response for that call alone, so the existing "not ok" branch degrades it: the table's patch list; the champion page's builds, matchups and patch list; the profile's match page; and the match timeline. Essential calls (profile, match, champion table and detail, current patch) still fail the page.

**Consequences.** A hung riot-proxy now costs a page at most 5 s (champions) or 30 s (profiles and matches) before the error page. With riot-proxy unreachable, the optional parts show their usual "unavailable" states instead of the page failing, as long as the essential call answered. No setting; the budgets are constants.

## ADR-041: The current patch is held for 5 minutes

Date: 2026-10-15 · Task: SPD-02

**Context.** Every page load asked riot-proxy for `/v1/static/versions` to learn the current patch: the profile, match, search and both champion pages. On a champion page it was the first of two steps that run before the analytics calls can start. riot-proxy answers it from its mirror in about 1 ms, and its answer changes about once a patch, every two weeks.

**Decision.** `patchVersions` in `src/lib/server/patch.ts` holds its answer (the current patch and Riot's version list) for `PATCH_TTL_MS`, 5 minutes, as ADR-013 holds the Data Dragon lookups. Concurrent callers share one request, and a failed fetch is not kept, so the next page tries again. No setting. This extends ADR-013's exception to the no-cache rule: it covers data that cannot change within a patch, never Riot player data or analytics.

**Consequences.** After riot-proxy's mirror moves to a new patch, pages keep the old patch's icons and names for up to 5 minutes; then `staticNames` loads the new patch's lookups once. Each page view makes one riot-proxy call fewer, about 1 ms on production, and a champion page no longer waits on that call before resolving its champion.

## ADR-042: A tier filter: one tier, or a tier and above

Date: 2026-10-19 · Task: VS-02

**Context.** The champion pages showed every tier summed; riot-proxy's `tier` filter (2.6.0) was unused. riot-proxy v2.7.0 adds `minTier`: a tier and every tier above it, summed, with pick and ban rates counting each match once over the matches with a player at or above that tier (riot-proxy ADR-170). The VS handoff proposed ranges only. The owner asked for both: a URL for one tier, and the same with a `+` for that tier and above, from Iron to Challenger.

**Decision.**

- **URL.** `?rank=diamond` is Diamond alone, sent to riot-proxy as `tier=DIAMOND`; `?rank=diamond+` is Diamond and above, sent as `minTier=DIAMOND`. Never both. A `+` left bare in a query string reads as a space, and a form encodes it as `%2B`; all three read as the range, and the page redirects to the bare `+`, which its own links write. Nothing is above Challenger, so `challenger+` redirects to `challenger`. An unknown value is every tier, never a 400 from riot-proxy. The rank sits after the role in the query.
- **Calls.** The table, detail, set builds and matchups get the rank; the patch lists never do, so the picker lists every patch the slice could have.
- **Picker.** One `<select>` beside the patch picker, in the same GET form with one Apply button for visitors without JavaScript: All tiers, then Grandmaster+ to Iron+, then each tier alone, highest first. Role tabs, the patch form, the table's champion links and the champion page's links keep the rank. Unplaced (`UNKNOWN`) is not offered: it isn't a rank.
- **Summed row.** riot-proxy labels the summed row with the body's own `tier`: `null` over every tier or a range, the tier when one is asked for. The table and the champion header take the row whose `tier` is the body's, so a single tier doesn't empty them.
- **Labels.** The scope line reads `every region · Diamond+` (or `every region and tier`), By tier's heading names the rank, and the note under the page says what each rate counts. With a range, By tier holds the range's tiers; with one tier, its row.
- **Default.** All tiers, as before, so riot-proxy's warm list needs no change. Each rank is its own riot-proxy cache entry and its own page at the edge: Cloudflare's cache key includes the query string, checked from outside on 2026-10-19 (each `?patch=` and `?role=` view MISS, then HIT with its own content).

**Consequences.** The first view of each rank after a rebuild is a riot-proxy MISS: about 121 ms for the table at `minTier=EMERALD` and 34 ms at `tier=EMERALD`, 2–3 ms for one champion (riot-proxy ADR-170). Low ranges such as Iron+ sum nearly every tier and are unmeasured; if one is slow in production, that goes to riot-proxy. Tests use synthetic range and tier bodies until real ones are recorded.

## ADR-043: Builds against a lane opponent: the pick in the query, no fallback

Date: 2026-10-19 · Task: VS-03

**Context.** riot-proxy v2.7.0 answers a champion's set builds in the games where it held a lane alone against one opponent (`opponentId`, riot-proxy ADR-171). Each build then has its 3rd item, boots, runes and spells; the 4th and 5th items, starter and skill order come back empty. An opponent never met is a 200 with no builds. riot-proxy's showcase added a _vs_ picker and links from its matchups (its ADR-172), keeping the pick in the URL's hash.

**Decision.**

- **The pick is in the query:** `?vs=syndra`, the opponent's champion page name, and optionally `&lane=mid`, a role tab's value. The server renders it, so it works without JavaScript and each pick is its own page at the edge. An unknown champion drops the pick and an unknown lane only the lane, with a redirect to the clean URL. With a role picked, the lane is dropped: the role is the lane.
- **Only the set builds are against the opponent.** `opponentId`, and the lane or the role as riot-proxy's `role`, go on the builds call; the detail, matchups and patch list are unchanged. Without a lane, riot-proxy picks the lane the two met in most and names it; the card's header says it, and the Matchups card follows that lane, as it follows the builds' role without an opponent.
- **The picker** leads the build tabs: a GET form (submitted on change, with an Apply button without JavaScript) that keeps the role, tier and patch, and goes to `#builds`. Its options come from the matchups the page already loaded (`vsChoices`): each opponent once, its games summed over lanes, most first, ties by name. A picked opponent the list lacks goes last without a count. Names are Data Dragon's; an opponent it doesn't know has no URL value, so it isn't offered.
- **Matchup links.** Each row's Lane cell links to the builds against that opponent in that lane. When a role or the builds' lane hides the Lane column, the win rate carries the link. The opponent's name still links to its own champion page. Role tabs, the patch and tier form, and the build tabs keep the pick.
- **Against an opponent, nothing empty is drawn.** The 4th and 5th item steps are dropped in `toSetBuilds`, and the card leaves out Skills and Starter. Without an opponent an empty part still shows `–`, where it means nobody chose one.
- **No fallback.** The detail's item, rune and spell lists aren't against anyone, so against an opponent an empty list says "No builds against Syndra in this slice yet." and a failed call "Builds against Syndra are unavailable right now.". The picker stays in both, so the visitor can step back.
- **Marking.** Builds against an opponent are marked "Low sample" under 100 games, as every rate is (ADR-035). `winRateLow` is not used (VS-04 dropped).

**Consequences.** Against an opponent most builds are marked, which is the honest reading of 10 to 50 games. Each pick is a riot-proxy MISS on its first view after a rebuild (2–3 ms per champion read). Opponent builds are empty in production until a builds rebuild has run since 2.7.0 started; until then the card says there are none. Tests use synthetic opponent bodies until real ones are recorded.

## ADR-044: Deadlines race the call; every riot-proxy outage is a 503

Date: 2026-11-03 · Task: RV-03

**Context.** ADR-040's deadline sometimes never fired: a page against a riot-proxy that accepted connections and never answered did not finish, and the unit test for it timed out in about one full run in three. `new Request(…, { signal })` follows the given signal through a weak reference, so a call that nothing else held could be garbage collected before the abort reached it. Collecting garbage while ten deadlines ran, the old wrapper hung every time and the new one never. A refused connection was also a 500, though ADR-040 calls every riot-proxy outage a 503, and CommunityDragon's `perks.json`, which every match page of a patch waits on, had no deadline.

**Decision.**

- **The call races the deadline.** `withTimeout` races the fetch, and then the body read, against a promise that its timer or the caller's abort rejects; the timer holds that promise, so it settles whatever else is collected. The fetch's own controller is still aborted, so a real request is cancelled.
- **Anything but the caller's own abort is a 503:** a spent budget, a refused connection, a DNS failure or a body that breaks off. `withTimeout` logs `proxy timeout <METHOD> <path> after <ms> ms` or `proxy unreachable <METHOD> <path>: <error>`; `logFailures` logs only error responses.
- **CommunityDragon gets 5 s** (`CDRAGON_BUDGET_MS`); a failure is not held, as before.
- **A 429 from the static lookups stays a 429** on a champion page, with its wait.
- The unit tests run with `--expose-gc`, and a test collects garbage while hung calls wait on their deadlines.

**Consequences.** A hung or stopped riot-proxy shows "Temporarily unavailable" with a 503 that the edge does not cache, in at most the call's budget. A 500 now means a bug.

## ADR-045: No response leaves without a cache policy; a page with a part missing is not cached

Date: 2026-11-03 · Task: RV-04

**Context.** The `handle` hook replaced the policy only on errors and form posts. A redirect thrown before a load called `setHeaders` (the profile's and `/champions`' tidied queries, a champion's name, the two old-URL routes) went out with no `Cache-Control`, which Cloudflare's Cache Everything rule caches for its default TTL. A match page whose Data Dragon lookups or CommunityDragon shards fell back was cached for a day like a complete one, and a champions page without its patch list for 10 minutes. `/champions/[key]` tidied its query with a 308, which browsers keep for good, so a later change of default or a champion the lookups did not know yet could not undo it. SvelteKit's own data responses already carry `private, no-store`, failed loads included.

**Decision.**

- **A response without `Cache-Control` gets `no-store`** in the `handle` hook, after the error and form-post rules.
- **The home page is prerendered**, like `/about`, so it is still served as a static file rather than falling under `no-store`.
- **`complete`.** `loadMatch`, `loadChampions` and `loadChampionPage` return whether every optional part loaded: the timeline, lookups and shards on a match; the patch list and lookups on `/champions`; the set builds, matchups and patch list on a champion page. An incomplete page gets `none`, as the profile already did without its match history.
- **308 for a champion's name, 307 for its query.**

**Consequences.** A degraded page costs riot-proxy a request per view until it recovers, as an error page does. Redirects are not cached at the edge.

## ADR-046: Timing for each load, in the server log

Date: 2026-11-03 · Task: SPD-07

**Context.** The page-speed plan (`docs/notes/page-speed.md`) changes how loads call riot-proxy (SPD-08, SPD-09) and what they return (SPD-11). Each change needs a before and after. The only timing logged so far was a slow analytics call (`proxy slow …`, SPD-01). The owner chose server logs only: no `Server-Timing` header, so nothing reaches the browser and the edge never replays a stale timing.

**Decision.**

- **One line per slow request.** The `handle` hook runs each request inside `timeLoad` (`src/lib/server/timing.ts`). A request slower than `SLOW_LOAD_MS` (100 ms) logs one `console.warn` line: `slow load <route id>[ (data)] <total>ms: <METHOD> <spec path> <ms>[ <status>|failed], …`.
- **Names, not values.** The page is its SvelteKit route id (`/summoner/[riotId]`), and each riot-proxy call its spec path template (openapi-fetch's `schemaPath`), so no player name is logged. `X-Cache` stays on the slow-analytics line.
- **Per request.** The `timeCalls` middleware records each call in an `AsyncLocalStorage` store that `timeLoad` opens, so calls from concurrent requests are never mixed. A call made outside a request is not recorded.
- **The total** is the whole request through `resolve`, render included.

**Measurements.** Production, `main` at 5fede17, 2026-11-03, on `ngf-prod-syd1`. `curl -w '%{time_total}'` against the site's own port straight after a restart (cold), then again at once (warm); the call times are from the `slow load` lines of the same run.

```text
page                            cold     warm   slow load line (cold)
/summoner/NinjaGoldfinch-OCENZ  256 ms   43 ms  204–222 ms: profile 36–38, matches 38–40, versions 14–17, static files 21–44, queues 20
/match/OC1_712351051            176 ms   62 ms  149–167 ms: match 14–18, timeline 45–46 (static data already held)
/champions                       39 ms   20 ms  under the threshold
/champions/ahri                  42 ms   20 ms  under the threshold (static data held from /champions)
/search?q=ahri (303)              7 ms    2 ms  no riot-proxy calls
```

- A cold profile waits for the static lookups after the profile and match calls, not alongside them (SPD-08).
- A cold match page spends about 100 ms outside riot-proxy: CommunityDragon's `perks.json`, which this line does not show, and the render (SPD-09).
- Visitors' cold champion pages in the same minutes logged 110–276 ms, with riot-proxy's analytics calls at 100–265 ms each against about 10 ms warm: riot-proxy's own cold reads, as ADR-039 found.
- The first champion page after a restart, before any other page, took 148 ms: `versions` 51 ms and the static files 20–60 ms.

**Consequences.** A slow page names the riot-proxy calls it waited on. The four `/v1/static/{file}` calls share one template; their order matches `staticNames`' (champion, item, summoner, runesReforged). No new dependency (`node:async_hooks`).

## ADR-047: Independent calls start together

Date: 2026-11-03 · Task: SPD-08

**Context.** ADR-046's timings showed a cold profile asking for the patch and its Data Dragon lookups only after the profile and match calls had answered, and a cold match page asking for its lookups and CommunityDragon's stat shards only after the match. Neither depends on those calls.

**Decision.** Each chain starts as soon as its own input is known, and chains run in parallel: profile (profile → match page) ‖ (patch → lookups); match: match ‖ timeline ‖ (patch → (lookups ‖ stat shards)); `/champions`: table ‖ patch list ‖ (patch → lookups). Failures behave as before (ADR-040, ADR-045). `early()` in `src/lib/server/errors.ts` marks a call started before it is awaited as handled, so a profile that fails first leaves no unhandled rejection. The champion page is unchanged: it needs the lookups to resolve the champion in its URL.

**Measurements.** Production, `main` at f691710, 2026-11-03: the server restarted, then the first requests, before any visitor's.

```text
cold profile  196 ms  versions 39 ‖ profile 51 → matches 75; static files 26–55 and queues 23 started during the profile and matches calls
cold match    131 ms  match 20, timeline 53 (lookups held from the profile; stat shards cold)
```

- The profile's riot-proxy calls took 126 ms, the profile → matches chain; one after another they would have taken about 220 ms. Before SPD-08 the cold profile took 204–222 ms with faster riot-proxy answers (profile 36–38 ms, matches 38–40 ms).
- The rest of the profile's time, about 70 ms, is parsing the lookups and rendering, as before; SPD-09 takes the lookups off the request.
- The cold match went from 149–167 ms to 118–131 ms, with the stat shards now fetched alongside the match.

**Consequences.** A cold page waits for its slowest chain, not the sum of its calls. A profile that fails still costs the lookups' calls, which are then held for the next page.

## ADR-048: Static data loaded at start-up; the patch refreshed in the background

Date: 2026-11-03 · Task: SPD-09

**Context.** ADR-013 holds the Data Dragon lookups for the current patch, and ADR-041 holds the version list for 5 minutes. After a restart the first page still waited for both, and after the 5 minutes the next request waited for `/v1/static/versions` again. ADR-047 measured a cold profile at 196 ms, about 70 ms of it parsing the lookups. The owner's answer for a new patch (`docs/notes/page-speed.md`): serve the old patch's lookups at once while the new patch's load, and switch when they are ready.

**Decision.** It covers data that can't change within a patch, never player data or analytics.

- **Start-up.** The server `init` hook (`src/hooks.server.ts`) starts `warmPatch`: the version list, then the current patch's lookups and stat shards. It is not awaited, so the server answers at once and early requests share the same loads. A failure is logged, not thrown. It does not run while `vite build` prerenders.
- **Refresh.** Once the held versions are older than `PATCH_TTL_MS`, `patchVersions` still answers with them at once and starts one background refresh, shared by every caller. A failed refresh keeps the held versions, and the next request tries again. Only a cold start, with nothing held, waits. The refresh runs outside the timing of the request that noticed the stale patch (`outsideLoad`, ADR-046), since that request doesn't wait for it.
- **A new patch.** When a refresh finds a new current patch, its Data Dragon lookups load first (`preparePatch`). Pages keep the old patch, its icons' version and its lookups, until they have loaded, then switch together, so a page never mixes two patches' names and icons. If they fail, the old patch stays. The new patch's stat shards start loading at the same time but don't hold back the switch: match pages already do without them (ADR-026), a cold start doesn't wait for them either, and CommunityDragon can publish a patch later than riot-proxy mirrors it. The plan named the stat shards too; the owner's answer named the lookups.
- **Two patches held.** The lookups and the stat shards each hold two patches (`HELD_PATCHES`), so the old patch still serves while the new one loads. A third drops the oldest. This replaces ADR-013's one patch.

**Measurements.** Production, `main` at a6b406b, 2026-11-03, with riot-proxy up for three hours. The site restarted, then the first requests, before any visitor's:

```text
first profile after a restart   118 ms   slow load 109 ms: profile 6, matches 36 (no /v1/static calls)
warm profile                     48 ms
profile 5½ minutes later         54 ms   no slow load line; no patch refresh failed
```

- ADR-047's cold profile, which still fetched the patch and lookups, took 196 ms; the lookups are now off the request.
- The request after the patch went stale did not wait for `/v1/static/versions`.
- The first profile's remaining ~65 ms over a warm one is outside riot-proxy (its calls took 42 ms): the server's first render of the page, with its code compiled on first use. Static data does not cover it; the owner accepted the result (2026-11-03).

**Consequences.**

- After a deploy, no visitor waits for the lookups. No request waits on `/v1/static/versions` or on a new patch's lookups once a patch is held.
- Holding two patches doubles the lookups' memory for the days after a patch change: a few MB.
- A new patch is shown up to `PATCH_TTL_MS` plus the time its lookups take after riot-proxy mirrors it.
- If CommunityDragon has not published a new patch's `perks.json`, match pages on the new patch show no stat shards until it has, and each match page tries again, as before.
- While riot-proxy fails a refresh, each request after the TTL starts another, one at a time; riot-proxy answers them from memory.

## ADR-049: MIT licence

Date: 2026-11-03 · Task: none

**Context.** The repository is public and had no licence, so nobody else had permission to use, copy or change the code. The owner's other open-source repositories are MIT.

**Decision.** The code is licensed under the MIT License (`LICENSE`), and `package.json` declares `"license": "MIT"`. It stays `"private": true`, which only stops it being published to npm.

**Consequences.**

- Anyone may reuse the code under MIT's terms, keeping the copyright notice.
- Third-party code keeps its own licence; MIT covers only this repository's own code.

## ADR-050: CI runs the gate; releases and deploys follow the shared pipeline

Date: 2026-11-05 · Task: DEP-01

**Context.** The plan kept CI/CD out of scope (`docs/IMPLEMENTATION.md:19`), and `CLAUDE.md` forbade adding any: `just check`, run by the pre-push hook, was the only gate (ADR-002, ADR-003, architecture decision 0010). Production builds in place from a checkout of `main` on `ngf-prod-syd1`. riot-proxy and ninja-monitor now release and deploy through the shared pipeline in `NinjaGoldfinch/ninja-actions` (a deploy tarball per release, `deploy.yml` behind the owner's approval, a health check and automatic rollback on the host). The owner asked for the site to join it, with CI on pull requests (owner, 2026-11-05).

**Decision.**

- The gate is `scripts/check.sh`, the steps `just check` ran, unchanged and in the same order. `just check`, the pre-push hook and CI all run it.
- `.github/workflows/ci.yml` runs it on every pull request and on `main`: on the self-hosted Proxmox runner, or on a hosted runner for a fork's pull request, with a read-only token, no secrets and actions pinned to commits. The unit tests read the server env, so the job copies `.env.example` to `.env`, as `just setup` does.
- `CLAUDE.md`'s rule changes from "do not add CI" to: CI, releases and deploys follow the shared pipeline, and change only through a task and an ADR. Releases (semver tags from `v1.0.0`, the owner's choice) and `deploy.yml` come in the next DEP tasks.

**Consequences.**

- A pull request shows the gate's result; nothing changes for local work.
- `just e2e` stays outside the gate, in CI as locally.
- GitHub Actions must be enabled on the repository and a runner registered for it on the Proxmox runner VM before the job can run there; until then a pull request's check stays queued.
- `tests/unit/gate.test.ts` fails if `just check`, the pre-push hook or `ci.yml` stop running `scripts/check.sh`, if the script's steps change, or if CI loses the fork rule, the read-only token or its pinned actions.

## ADR-051: `/healthz` reports the version in `package.json`

Date: 2026-11-05 · Task: DEP-02

**Context.** The shared deploy script (`ninja-actions` `infra/deploy.sh`, `ninja-deploy`) restarts the unit, then polls the service's health URL. If the one-line JSON body has a top-level `"version"` string, the deploy counts as healthy only once it equals the tag it activated, with or without the leading `v`; without one, any 200 counts, so the old process still answering would pass. ninja-monitor reports `env!("CARGO_PKG_VERSION")`, its manifest's version, and its release workflow refuses a tag that does not match the manifest.

**Decision.**

- `GET /healthz` answers `{"ok":true,"version":"<x.y.z>"}`. `ok` stays, so existing checks keep working.
- The version is `package.json`'s, compiled into the server bundle (`src/lib/server/version.ts`), as ninja-monitor does. Only the string is bundled, not the rest of `package.json`.
- The release workflow (DEP-03) must refuse a `v*` tag that does not match `package.json`'s version, or every deploy of it would fail its health check and roll back.

**Consequences.**

- A deploy waits for the new release to answer, and rolls back if the old one never stops answering.
- Releasing means bumping `package.json`'s version in a PR before tagging.
- A build from a checkout reports `package.json`'s version too (`0.0.1` until `v1.0.0`), whatever commit it is.
- `tests/unit/healthz.test.ts` fails if the body loses `ok` or `version`, the version stops matching `package.json`, or it stops being a semver a tag can match on one line.

## ADR-052: a `v*` tag builds a self-contained release tarball

Date: 2026-11-05 · Task: DEP-03

**Context.** ninja-deploy uploads one release asset per version: a `.tar.gz` with one top-level directory holding `version.json`, checked against the release's `SHA256SUMS`, unpacked to `/srv/<service>/releases/<version>/` (`ninja-actions` `deploy/action.yml`, `infra/deploy.sh`). ninja-monitor's `release.yml` builds its tarballs on a `v*` tag after its CI, with build provenance. The site's server is `build/` from adapter-node, which bundles everything except `package.json`'s `dependencies`; `openapi-fetch` was the only one, so `build/` needed a `node_modules` beside it. The public origin is fixed at build time (ADR-014).

**Decision.**

- `openapi-fetch` moves to `devDependencies`, so adapter-node bundles it and `package.json` has no `dependencies`. A release then needs Node (22.18 or later) and nothing installed. This changes no code that runs; the rule on new runtime dependencies still applies to anything the server imports.
- `scripts/package.sh <tag> [out]` refuses a tag that is not `v` plus `package.json`'s version (ADR-051), builds with `ORIGIN=https://ninjagoldfinch.lol` into a temporary directory (`BUILD_OUT`, read by `vite.config.ts`, so the checkout's `build/` keeps its origin), and writes `ninjagoldfinch-lol.tar.gz` (`ninjagoldfinch-lol/` holding `build/`, `package.json`, `LICENSE` and `version.json`, `{"version","commit","built_at"}` as ninja-monitor writes it) and `SHA256SUMS`.
- `.github/workflows/release.yml` runs on `v*` tags: the gate (`ci.yml`, now also `workflow_call`), then `package.sh` on the self-hosted runner, attestation, and a GitHub release with the tarball and `SHA256SUMS`, checked again before publishing. Only the publishing job can write; actions are pinned to commits.
- `scripts/package.test.sh` joins the gate after the deploy test (about 3 s): bad and mismatched tags are refused, and the tarball, unpacked away from the checkout with no `node_modules`, answers `/healthz` with its version and serves `/champions` from the mock riot-proxy.

**Consequences.**

- The unit runs `node <release>/build`; its env (`PROXY_URL`, `PROXY_KEY`, `PORT`, …) stays in the unit, outside the release. DEP-04 and DEP-05 set up the host.
- A release built for another origin needs `ORIGIN` set when running `package.sh` by hand.
- `tests/unit/release.test.ts` pins the workflow's trigger, order, permissions, runners and pinned actions, and that `package.json` keeps no `dependencies`.
