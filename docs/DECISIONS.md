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

Date: 2026-10-09 · Task: P2-06 · Recorded fixtures staying unedited refined by ADR-073

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
- The `Dockerfile`, `deploy/compose.yaml` and `deploy/proxmox/` stay for the LAN preview VM (removed in ADR-067).

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

## ADR-053: releases reach production through `deploy.yml` and `ninja-actions/deploy@v1`

Date: 2026-11-05 · Task: DEP-04

**Context.** riot-proxy and ninja-monitor deploy with a `deploy.yml` started by hand: it runs in the `prod` environment, which waits for the owner's approval, and calls `NinjaGoldfinch/ninja-actions/deploy@v1` with the service name, the tag and the release asset. The action downloads the asset and checks it against the release's checksums, uploads it over SSH with a key forced to `ninja-deploy <service>`, and activates it; the host health-checks and rolls back by itself. The site's releases carry `ninjagoldfinch-lol.tar.gz` and `SHA256SUMS` (ADR-052), and `/healthz` reports the version (ADR-051).

**Decision.**

- `.github/workflows/deploy.yml` is the sibling workflow with only the service and asset changed: `workflow_dispatch` with `env` (only `prod` until a staging host exists) and `version`; the `prod` environment; one deploy per environment at a time; `contents: read`; the self-hosted runner; host, known hosts and key from the environment (`DEPLOY_HOST`, `DEPLOY_KNOWN_HOSTS`, `DEPLOY_SSH_KEY`).
- The action is used at its `v1` tag, as riot-proxy and ninja-monitor do, so fixes to the shared pipeline reach every service. It is the owner's own repository; third-party actions stay pinned to commits.
- `SHA256SUMS` is the action's default checksums name, so the workflow does not pass one.

**Consequences.**

- Nothing deploys until the owner sets up the `prod` environment (required reviewer, the secret and the two variables) and `ninja-deploy` for `ninjagoldfinch-lol` on `ngf-prod-syd1` (health URL `http://127.0.0.1:3000/healthz`). Moving production from its checkout to `/srv/ninjagoldfinch-lol` is DEP-05.
- A deploy runs only on approval in GitHub; the deploy key lets the repository run any release of the site with the unit's permissions and env, and nothing more.
- `tests/unit/deploy-workflow.test.ts` pins the trigger, the `prod`-only choice, the environment, concurrency, the action and its inputs, the asset name `release.yml` publishes and the read-only token.

## ADR-054: `v1.0.0`, and production runs releases from `/srv/ninjagoldfinch-lol`

Date: 2026-11-05 · Task: DEP-05

**Context.** Production runs `node build` in the checkout `/opt/ninjagoldfinch-lol` (owner's unit, ADR-038). ADR-051 to ADR-053 give the site versioned releases and a `deploy.yml`, and `ninja-deploy` keeps releases in `/srv/<service>/releases/` with `current` linked to the live one. `deploy-host-add.sh --adopt` moves a running service into `/srv` by copying one installed binary in as the first release and pointing the unit at it with a drop-in; the site is a directory built from a checkout, not a binary. The owner chose semver releases from `v1.0.0` (ADR-050).

**Decision.**

- `package.json`'s version becomes `1.0.0`; the merge commit is tagged `v1.0.0`.
- A drop-in, `deploy/systemd/ninja-deploy.conf`, installed as `/etc/systemd/system/ninjagoldfinch-lol.service.d/ninja-deploy.conf`, sets `WorkingDirectory=/srv/ninjagoldfinch-lol/current` and `ExecStart=/usr/bin/node /srv/ninjagoldfinch-lol/current/build`. The owner's unit keeps its user, `EnvironmentFile` and hardening; the server writes nothing to disk, so `ProtectSystem=strict` still fits.
- The move copies `--adopt` by hand (`docs/deployment/releases.md`): `deploy-host-add.sh` without `--adopt`, `v1.0.0` unpacked as the first release from the published tarball after checking `SHA256SUMS`, `current` linked, the drop-in installed, one restart and a check that `/healthz` reports `1.0.0`. Removing the drop-in goes back to the checkout. A `deploy.yml` run of `v1.0.0` then proves the pipeline end to end.
- The `prod` environment copies riot-proxy's: the owner as required reviewer, deploys from `main` only, the same host variables, a deploy key of its own.

**Consequences.**

- Releases reach production only through `deploy.yml`; `update-all ninja-lol` is retired, and the checkout stays as the fallback until releases have settled, then goes.
- Each release is a `package.json` bump merged to `main`, then its tag (ADR-051); a failed health check rolls back to the previous release on the host.
- The move itself is owner work on GitHub and the host; this task's PR carries the version, the drop-in and the procedure. DEP-05 is ticked once production runs `v1.0.0` from `/srv`.
- `tests/unit/systemd-dropin.test.ts` pins the drop-in to exactly those settings and to the service and layout `deploy.yml` and `scripts/package.sh` use.

## ADR-055: security headers on every response, a hash-based CSP, and `/` and `/about` rendered per request

Date: 2026-11-05 · Task: P5-03

**Context.** The site sent no security headers, and Cloudflare adds none (`curl -sI https://ninjagoldfinch.lol/`, 2026-11-05). Pages are cached at the edge and shared between visitors (ADR-045). Each page has one inline script, SvelteKit's bootstrap, and no `{@html}`, `eval` or workers; Svelte's `style:` directives render as `style` attributes; images come from Data Dragon and CommunityDragon (`src/lib/assets.ts`), and the site icon is a `data:` URI that Vite inlines. `/` and `/about` were prerendered (ADR-045), and adapter-node serves prerendered pages and `/_app/*` files without running `handle`.

**Decision.**

- **Headers in `handle`.** `setSecurityHeaders` (`src/lib/server/security.ts`) sets `Strict-Transport-Security: max-age=31536000`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, `X-Frame-Options: DENY`, `Cross-Origin-Opener-Policy: same-origin` and a `Permissions-Policy` denying accelerometer, camera, geolocation, gyroscope, magnetometer, microphone, payment and USB, on every response `handle` returns: pages, redirects, errors, `__data.json` and `/healthz`. It runs after the cache rules and leaves `Cache-Control` alone.
- **HSTS for this host only**, without `includeSubDomains` or `preload` (owner, 2026-11-05), so no other subdomain is committed to HTTPS and the header can be withdrawn.
- **CSP through SvelteKit's `csp` option in hash mode** (`vite.config.ts`, `CSP_DIRECTIVES` in `src/lib/server/security.ts`): `default-src 'self'; script-src 'self'` plus the bootstrap's hash; `style-src 'self'; style-src-attr 'unsafe-inline'; img-src 'self' data:` and the two image origins from `assets.ts`; `connect-src`, `font-src`, `base-uri` and `form-action` `'self'`; `object-src 'none'; frame-ancestors 'none'`. Hashes, not nonces: a nonce in a page cached at the edge would be served to every visitor. No `'unsafe-inline'` or `'unsafe-eval'` for scripts.
- **`style-src-attr 'unsafe-inline'` stays.** The server renders `style:` as attributes, and they carry values computed from data: the gold chart's points and labels, objective markers, damage bars, and image placeholders sized by a prop. Classes cannot express continuous positions, and without JavaScript nothing could set them through the CSSOM. The keyword covers only `style` attributes; `<style>` elements and other origins' stylesheets stay blocked.
- **`/` and `/about` are rendered per request** (owner, 2026-11-05). Prerendered, they would miss every header but a `<meta>` CSP, which cannot carry `frame-ancestors`. Each has a `+page.server.ts` that sets a new `static` policy, `public, s-maxage=600, stale-while-revalidate=600`; neither calls riot-proxy, so rendering costs almost nothing and the edge still serves repeat views. This replaces ADR-045's prerendered home page; until now these two pages had no `Cache-Control` and Cloudflare's Cache Everything rule kept them for its default TTL.
- **`/_app/*` files are left alone.** They skip `handle`; CSP, framing and COOP apply to documents, not to the scripts, styles and fonts they load. They are the site's own hashed files with a correct `Content-Type`, so `nosniff` on them would add little, and setting it would need a server in front of adapter-node.

**Consequences.**

- A new third-party origin (an image host, analytics, a font) must be added to `CSP_DIRECTIVES`, or the browser blocks it. `tests/e2e/security.test.ts` fails on any CSP violation while the pages are used, with JavaScript and without.
- `/` and `/about` now reach the Node process on an edge miss, once per 10 minutes per URL.
- After the deploy, check through Cloudflare: `curl -sI https://ninjagoldfinch.lol/` and `/champions`.

## ADR-056: the CSP allows Cloudflare Web Analytics

Date: 2026-11-05 · Task: P5-03

**Context.** Cloudflare adds its Web Analytics beacon to every page at the edge: a deferred `<script src="https://static.cloudflareinsights.com/beacon.min.js/…">` that reports page views, load timing and Core Web Vitals to `https://cloudflareinsights.com`, without cookies or storage. The site's code does not include it. After `v1.0.1` (ADR-055) the CSP blocked it in production, so Cloudflare recorded nothing. The owner wants the analytics on (2026-11-05).

**Decision.**

- `CLOUDFLARE_INSIGHTS` in `src/lib/server/security.ts` names the two origins. `script-src` adds `https://static.cloudflareinsights.com` and `connect-src` adds `https://cloudflareinsights.com`. Nothing else changes: still no `'unsafe-inline'` or `'unsafe-eval'` for scripts, and the beacon is an external script, so it needs no hash.

**Consequences.**

- Every page trusts one more script origin, Cloudflare's, which already serves the whole site.
- The Web Analytics dashboard shows human page views (cached pages and client-side navigation included) and real visitors' Core Web Vitals, alongside SPD-07's server timings.
- If Web Analytics is turned off in Cloudflare, these two entries can go.

## ADR-057: every release is also built for staging and deployed there without approval

Date: 2026-11-05 · Task: DEP-06

**Context.** A staging host now exists for the shared pipeline: `ngf-mon-syd1` (OVH, `ENV=staging` for `ninja-deploy`), where ninja-monitor already deploys through its `deploy.yml` with `env=staging`. The owner decided (2026-11-05) that the site has a staging copy at `https://staging.ninjagoldfinch.lol`, public only behind Cloudflare Access on its own tunnel, that every release deploys there automatically with no approval, and that prod keeps its approval (ADR-053). The site reaches the staging riot-proxy on loopback. The origin is fixed at build time (ADR-014), so a tarball built for production refuses form posts on any other host. A release created with the workflow's own `GITHUB_TOKEN` starts no other workflow, so a deploy triggered on `release: published` would never run.

**Decision.**

- `scripts/package.sh` builds the same commit twice: `ninjagoldfinch-lol.tar.gz` for `https://ninjagoldfinch.lol` and `ninjagoldfinch-lol-staging.tar.gz` for `https://staging.ninjagoldfinch.lol`, same layout and `version.json`, one `SHA256SUMS` listing both. The two origins are fixed in the script; the `ORIGIN` override for hand builds (ADR-052) goes.
- `release.yml` attests and publishes both, then calls `deploy.yml` with `env: staging` and the tag. The calling job gets only `contents: read`. It passes `secrets: inherit`: a called workflow sees only the secrets its caller passes on, even those of the environment its own job runs in. Without it, `v1.0.3`'s staging deploy got the `staging` environment's variables and an empty `DEPLOY_SSH_KEY`, and failed; a manual run of `deploy.yml` with the same inputs deployed. The repository has no repository or organisation secrets, so the key is all that reaches the deploy.
- `deploy.yml` takes `staging` or `prod` (staging by default, as ninja-monitor's) by hand, and `env` and `version` through `workflow_call`. It picks the tarball by environment. A first job refuses any other environment name, because a called workflow takes any string and GitHub would create an unknown environment, unprotected, before the deploy job could refuse it. The concurrency group moves to the deploy job, one deploy per environment at a time either way.
- The `staging` environment has no reviewer and deploys from `main` (by hand) and from `v*` tags (the release run). The host install on `ngf-mon-syd1` is fresh, with no checkout: production's unit with `WorkingDirectory=/srv/ninjagoldfinch-lol/current`, so it needs no drop-in, and a key from the staging riot-proxy. Both are owner work (`docs/deployment/releases.md`). ADR-058 replaces the staging riot-proxy with production riot-proxy and a key of staging's own, until a staging riot-proxy is needed. Until the staging riot-proxy exists the site runs there with a placeholder `PROXY_KEY`: it starts, `/healthz` (which never calls riot-proxy) passes the deploy's health check, and data pages answer 503; the real key replaces it later.

**Consequences.**

- Every release reaches staging minutes after it is published; prod is still deployed by hand after the owner's approval.
- Releases up to `v1.0.2` have no staging tarball; the first staging deploy is the next release. The `staging` environment and the host install must come before that release's tag: without them its staging job, and so the release run, fails, though the release itself is published.
- A release takes one more build (about 3 s). The package test (`scripts/package.test.sh`, in the gate) runs both tarballs and checks that each accepts a form post from its own origin and refuses one from the other's.
- CI checks against the public staging hostname would need a Cloudflare Access service token; checks from the box use loopback.
- `tests/unit/deploy-workflow.test.ts` and `tests/unit/release.test.ts` pin the two tarballs, the staging job and its inputs, the environment check and the asset choice.

## ADR-058: staging reads from production riot-proxy, with its own key

Date: 2026-11-05 · Task: DEP-06

**Context.** ADR-057 had staging reach a staging riot-proxy on loopback. None exists, and nobody owns setting one up: it would need its own Riot API key (two proxies sharing one would each spend the other's Riot rate limit unseen), memory the shared 3.7 GB staging box may not have (production riot-proxy peaked at 7.3 GB on 2026-11-03), and its own database and backfill. Production riot-proxy is already public at `https://api.ninjagoldfinch.lol` (its own tunnel, key authentication, a WAF over the admin and metrics paths), and the site accepts an `https` `PROXY_URL`. The owner chose to point staging at it until a staging riot-proxy is needed (2026-11-05).

**Decision.**

- The staging site uses `PROXY_URL=https://api.ninjagoldfinch.lol` with a consumer key of its own on production riot-proxy, `ninjagoldfinch-lol-staging`, quota 120 a minute (production's is 600), made with riot-proxy's CLI run as its unit runs (`docs/deployment/releases.md#staging`, step 5). Production's key is never shared.
- Nothing in the code or the pipeline changes: the setting lives in staging's `/etc/ninjagoldfinch-lol/env`.

**Consequences.**

- Staging shows real data now, behind Access. Its calls, Refresh included, spend production riot-proxy's quota and Riot rate limit, capped by the key's quota; revoking the key cuts staging off without touching the live site.
- Staging tests the site against production data, not riot-proxy changes; that still needs a staging riot-proxy. Switching to one is an env edit (`PROXY_URL=http://127.0.0.1:8080` and its key).
- Checked on 2026-11-05: staging at `1.0.3` answered `/healthz`, `/champions` and `/champions/ahri` with 200 through the staging key.

## ADR-059: the browser tests run in CI, on a hosted runner

Date: 2026-11-05 · Task: DEP-07

**Context.** ADR-050 put the gate (`scripts/check.sh`) in CI and left `just e2e` out, as it had been. The browser tests are the only check that drives pages in a real browser: navigation, filters, match tabs and popups, the timeline chart, Refresh, the CSP. A release could pass CI with them failing. The owner asked that nothing deploys untested (2026-11-05). The self-hosted runner (`ngf-ci-home`, Debian 13 from `ninja-actions` `infra/runner-setup.sh`) has build tools only, and its `runner` user has no sudo, so a job cannot install the system libraries Chromium needs.

**Decision.**

- `ci.yml` gains a second job, `just e2e`: checkout, Node 22, `pnpm install --frozen-lockfile`, `.env` from the example, `pnpm exec playwright install --with-deps chromium`, then `pnpm playwright test`, the command `just e2e` runs. It runs on every pull request and push to `main`, and before every release, since `release.yml` calls `ci.yml`.
- It always runs on `ubuntu-24.04`, where `--with-deps` can install Chromium's libraries. That is free for a public repository, needs no change to the runner VM, and is safe: the job reads no secrets and has a read-only token, like the fork path of `just check`.
- It stays outside `scripts/check.sh` and the pre-push hook, which keep their ADR-050 steps.

**Consequences.**

- A pull request shows two checks; a release builds only after both pass.
- The job downloads Chromium on each run (a minute or two).
- If the runner VM later gets Chromium's libraries, the job could move there; nothing else would change.
- `tests/unit/gate.test.ts` fails if the job stops running `just e2e`'s command, stops installing Chromium with its libraries, moves off the hosted runner, reads secrets, or stops running before releases.

## ADR-060: nothing reaches prod that has not passed a smoke test on staging

Date: 2026-11-05 · Task: DEP-08

**Context.** Before a release is built, CI runs the gate and the browser tests (ADR-059). Nothing tested a release once it ran on staging, and a prod deploy did not look at staging at all. The only check on a host was `ninja-deploy`'s health check: `/healthz` reports the new version. The owner asked that nothing deploys to prod unless it has passed on staging (2026-11-05). ninja-actions builds the gate into the shared deploy action (ninja-actions #14), so every repository uses one check: `require-status` refuses a version unless its commit has one of the named commit statuses at success, `set-status` sets one after a successful deploy, and `unverified-reason` breaks the glass, logged. The status names are shared: `staging/smoke` and `prod/deployed`. Staging is behind Cloudflare Access (ADR-057), so a check from CI needs an Access service token.

**Decision.**

- `scripts/smoke.sh <base-url> <version>` checks that `/healthz` reports the version, and that `/`, `/about`, `/champions`, `/champions/ahri`, a profile and a match (the owner's, also in the fixtures) answer 200 with a Content-Security-Policy. Each page gets three tries, so one slow riot-proxy call does not fail a deploy. With `CF_ACCESS_CLIENT_ID` and `CF_ACCESS_CLIENT_SECRET` set it sends them as Access headers, from a file rather than the command line. A redirect on `/healthz` is reported as Access refusing the token.
- After a staging deploy, `deploy.yml` runs it against `https://staging.ninjagoldfinch.lol` with the `staging` environment's token, then records the outcome, success or failure, as `staging/smoke` on the version's commit. The script comes from the workflow's commit, so the test can be rerun for an older release.
- A prod deploy passes `require-status: staging/smoke prod/deployed` and `set-status: prod/deployed` to the action. `prod/deployed` marks versions that were live in prod, so rolling back to one is allowed without a new staging run. `break_glass`, an input of the manual run only, becomes `unverified-reason`.
- The deploy job gets `statuses: write`, and `release.yml`'s staging caller grants it. That is the only write either has.
- The package test runs the smoke test against both tarballs and the mock riot-proxy, and checks that it fails on the wrong version.

**Consequences.**

- The check runs after the prod approval, inside the action, but before anything is downloaded or touched on the host.
- Releases from before this have neither status. Versions that were live in prod are marked `prod/deployed` once by hand, and a later release reaches prod through staging (`docs/deployment/releases.md`).
- A failed smoke test leaves `staging/smoke` at failure, and the release run fails. Rerunning the staging deploy after a fix sets it again.
- This needs the action with ninja-actions #14 at `v1`. An input the action does not know is ignored with a warning, which would skip the check, so this is merged only after `v1` moves. It also needs the Access token in the `staging` environment.
- `tests/unit/deploy-workflow.test.ts` pins the gate's inputs, the break-glass input (manual only), the smoke step (staging only, after the deploy, with the token), the status it records and the permission; `scripts/package.test.sh` runs the script.

## ADR-061: the build's identity is baked in, and /api/version is public

Date: 2026-11-05 · Task: STAT-01

**Context.** The owner is building a status bot that polls every ninjagoldfinch service, to a shared status contract: `version`, `commit` and `built_at` injected at build time, never read from git at runtime. Until the bot can authenticate, it should see a deploy by a public version changing. `/healthz` already reports package.json's version, which ninja-deploy matches against the tag (ADR-051), but not the commit, and `version.json` sits beside the build where the server does not read it. This site has no crawler, database or object storage of its own: those live in riot-proxy, so the site's status covers the frontend only (owner, 2026-11-05).

**Decision.**

- `scripts/package.sh` passes `BUILD_VERSION` (package.json's version, which equals the tag) and `BUILD_COMMIT` (the short sha) to `vite build`. `vite.config.ts` bakes them into the server as `__BUILD__`, with the build time. A build without both, such as `just dev`, a plain `pnpm build` or the tests, reports `dev` for version and commit.
- `src/lib/server/version.ts` exports `BUILD`, the one source for the status endpoints. `/healthz` keeps package.json's version, unchanged, because ninja-deploy reads it.
- The server logs `ninjagoldfinch-lol <version> commit <sha> built <time>` from the `init` hook.
- `GET /api/version` answers `{"version","commit"}` and nothing else, public and `no-store`.

**Consequences.**

- The package test checks that each tarball answers `/api/version` with the release and `HEAD`'s short sha, and logs them at start-up.
- `/api/version` reveals only what a release tag already makes public.
- `/api/status` (STAT-02) reports the same `BUILD`.

## ADR-062: /api/status, to the shared status contract, behind a token

Date: 2026-11-05 · Task: STAT-02

**Context.** The owner's status bot polls a `GET /status` on every ninjagoldfinch service, to one contract: build identity, uptime, background checks and flat numeric metrics, answered from memory in under 50 ms, `200` even when down. The site has no crawler, database or object storage; riot-proxy reports those (owner, 2026-11-05). What the site can report is its own traffic, its calls to riot-proxy, and whether riot-proxy will serve it. riot-proxy has no `/status` in the committed spec (2.7.0); it has `/readyz`, which answers 200 when ready and 503 with the same body when not. Production listens on `127.0.0.1` and every request reaches it through `cloudflared`, also on loopback, with `ADDRESS_HEADER` unset (ADR-038), so a rule that trusts loopback would trust the internet.

**Decision.**

- `GET /api/status` answers the contract (`service: ninjagoldfinch-lol`, `host` from the hostname) from `src/lib/server/status.ts`, reading held check results, `BUILD` (ADR-061) and in-memory counters only. `no-store`.
- Checks run from the `init` hook at start-up and every `STATUS_CHECK_INTERVAL_S` (30 s by default), never from a request:
  - `riot_proxy`: `GET /readyz` with the site's key, through `proxy.ts`'s `createProxyClient` with a 5 s deadline. 200 is `ok`; anything else is `down`, with a detail: `unreachable`, `not ready: sqlite, limiter`, `key refused (401)` or `answered <status>`. When riot-proxy's spec gains `/status`, the check moves to it and mirrors its `status`.
  - `static_data`: `ok` once a patch and its lookups are held, `degraded` before.
- Metrics, in `src/lib/server/metrics.ts`: `http_requests_total`, `http_errors_total` (5xx) and `api_requests_total` (`/api/…`), counted in `handle`; `proxy_requests_total`, `proxy_errors_total` (no answer, 429 or 5xx; a 404 is an answer), and `proxy_latency_ms_p50`/`_p95` over 5 minutes from a ring of the last 4096 calls, counted on the pages' client only; and `patch_age_s`. The contract's `metrics` holds numbers only, so the patch's age is a gauge rather than a timestamp.
- Access: `Authorization: Bearer <STATUS_TOKEN>` (16 characters at least, compared in constant time), or no token from loopback or `STATUS_ALLOW_CIDR`. A request with `Cf-Connecting-Ip` always needs the token: Cloudflare sets that header on every request it forwards, whatever the visitor sent, and the tunnel is the only way in. Anything else gets `401` with `WWW-Authenticate: Bearer`.

**Consequences.**

- Stopping riot-proxy turns `riot_proxy` `down` within one interval plus the 5 s deadline, 35 s by default.
- The check logs through the client's usual failure lines, once an interval while riot-proxy is down.
- The mock riot-proxy answers `/readyz` from a synthetic fixture. The package test reads `/api/status` from each tarball on loopback, waits for `riot_proxy` `ok` and the release's version, and checks that a request through Cloudflare without the token gets `401`.
- The bot reaches `/api/status` through Cloudflare with the token. The owner adds `STATUS_TOKEN` to each host's env file; until then only the host itself can read it.

## ADR-063: events on changes of state, to an optional URL

Date: 2026-11-05 · Task: STAT-03 · The alarm's record without `EVENTS_URL` refined by ADR-064

**Context.** The status bot polls `/api/status` (ADR-062), but a poll only shows the state at that moment. The shared status contract also has an event, POSTed to a URL on a change of state, which riot-proxy sends from its STS-04 (`riot-proxy:docs/design/14-status.md`, "Outbound events"): `schema`, `service`, `host`, `event`, `severity`, `at` and an object `detail`. The site has two changes worth an event: riot-proxy going and coming back, and a new release starting. The server keeps nothing on disk, so it cannot tell a deploy from a restart without somewhere to remember the last version.

**Decision.**

- `EVENTS_URL` (optional, absolute http/https): events are POSTed there as the contract's event, `service: ninjagoldfinch-lol`, `host` from the hostname. Unset, none are sent. `src/lib/server/events.ts`.
- `EVENTS_URL` with a username or password is refused at start-up. `fetch` cannot send to such a URL: `new Request` rejects it, so no event would ever be delivered, and its error holds the whole URL, so each dropped event would write the password to the journal. The contract has no auth header, so a receiver that wants a secret takes it in the URL's path or query string, which is delivered and not logged. `EVENTS_URL` may therefore hold a token: it lives only in the env file, like `PROXY_KEY`, and no message about a refused `EVENTS_URL` shows its value. How the status bot's receiver authenticates events is the bot's decision, not made here.
- Events, on changes of state only:
  - `proxy_unreachable` (critical): the `riot_proxy` check (ADR-062) is `down` 3 times in a row, 60 to 95 s by default; `detail.reason` is the check's detail. Once per outage.
  - `proxy_recovered` (info): the first `ok` after it. A `degraded` neither raises nor clears it.
  - Whether `proxy_unreachable` is raised is kept in `$STATE_DIRECTORY/proxy-alarm.json`, written when it is raised and when it clears, and read at start-up. So a server restarted during an outage (a deploy, a crash) does not send a second `proxy_unreachable` for it, and still sends `proxy_recovered` on its first `ok`, even if riot-proxy came back while it was down. Without `STATE_DIRECTORY` the alarm lives in the process, and neither holds across a restart. A write that fails is logged and not retried, and the event is still sent, so the record is then one change behind until the next change. A restart in that time goes by the stale record: after a raise that was not recorded, a second `proxy_unreachable` if riot-proxy is still down and no `proxy_recovered` if it is back; after a clear that was not recorded, a second `proxy_recovered` on the first `ok`, and no `proxy_unreachable` for an outage that starts before it. `/api/status` is right throughout.
  - `deployed` (info): the server starts with another release than the previous start; `detail` is `{ from, to }`. The first start with nothing recorded, the same version again, and a `dev` build send nothing.
- The version is kept in `$STATE_DIRECTORY/last-version.json`; it and `proxy-alarm.json` are written through a temporary file and a rename. The drop-in `deploy/systemd/ninja-deploy.conf` gains `StateDirectory=ninjagoldfinch-lol`, so systemd makes `/var/lib/ninjagoldfinch-lol` for the unit's user, writable under `ProtectSystem=strict`, and sets `STATE_DIRECTORY`. Unset, or unreadable or unwritable, no `deployed` is sent and the start goes on.
- Delivery, as riot-proxy's: a queue of at most 64 (a full queue drops the newest, with a warning) and one worker that sends in order, so a `proxy_recovered` cannot overtake the `proxy_unreachable` still being retried. Each event gets up to 5 POSTs of 5 s, with 1, 2, 4 and 8 s between them; any 2xx is delivered, and a dropped event is logged. Nothing in a request waits on it, and nothing is formatted for Discord or any other service.
- A redirect is a failed attempt (`redirect: 'error'`). `fetch` would follow a 301 or 302 by sending a GET with no body, and that GET's 2xx would count as delivered, so an `EVENTS_URL` that redirects (`http://` to `https://`, a trailing slash) would lose every event while reporting success. `EVENTS_URL` must be the receiver's final URL.
- Delivery is at most once. An event dropped after its 5 attempts (about 40 s with the receiver down), or still queued when the server stops, is not sent again. For `deployed` that follows from recording the version before the event is delivered: the next start sees the same version and sends nothing. For the proxy events the state is recorded when the event is queued, so a lost `proxy_unreachable` can be followed by a `proxy_recovered` on its own. This is accepted: the status bot's polls of `/api/status` (ADR-062) carry the version and the `riot_proxy` check whatever happened to an event, and resending after a restart would need delivery state on disk for an event that is only a notice.

**Consequences.**

- ADR-054's "the server writes nothing to disk" no longer holds: it writes one small file per start in its state directory.
- Each host needs `StateDirectory=` once (`docs/deployment/releases.md`, "The state directory"). On production the owner reinstalls the drop-in, since the one installed came from the `v1.0.0` tag. Staging has no drop-in: its unit is a full one, and the owner adds the line to it; until then staging sends no `deployed`, with nothing logged. On both the owner then runs `systemctl daemon-reload` and adds `EVENTS_URL` to `/etc/ninjagoldfinch-lol/env`. The first start after that records the version without an event; the next release sends `deployed`.
- A restart of riot-proxy shorter than three checks sends nothing.
- `startChecks` waits for its callback, so the alarm's record is written before the next check starts; a callback that throws is logged and the checks go on.
- The package test starts each tarball with a previous version recorded and a local receiver as `EVENTS_URL`, and checks the `deployed` event arrives and the new version is recorded. It then starts one tarball with nothing on riot-proxy's port and a 5 s check interval, waits for `proxy_unreachable` from the third failed check, restarts it with the mock riot-proxy up, and checks `proxy_recovered` arrives: the `init` wiring and the alarm's record, from real checks.

## ADR-064: no proxy alarm, and no record of it, without `EVENTS_URL`

Date: 2026-11-06 · Task: FIX-09 (review of #126, issue #127; refines ADR-063)

**Context.** ADR-063 keeps whether `proxy_unreachable` is raised in `$STATE_DIRECTORY/proxy-alarm.json`, so a restart during an outage neither repeats it nor loses its `proxy_recovered`. The alarm ran whether or not `EVENTS_URL` was set, and recorded each change even when nothing was sent. On a host with `STATE_DIRECTORY` and no `EVENTS_URL`, an outage was recorded as raised with no event sent. If `EVENTS_URL` was then added and the site restarted while riot-proxy was still down, the receiver got no `proxy_unreachable` for that outage, and later a `proxy_recovered` with nothing before it.

**Decision.** Without `EVENTS_URL` the site does not watch the `riot_proxy` check for events: the alarm does not run, and `proxy-alarm.json` is neither read nor written. The record says what the receiver was told, and with no URL it was told nothing. A record left by an earlier start that had a URL stays as it was, so when the URL comes back the receiver still gets the `proxy_recovered` it is owed. `proxyWatch` in `src/lib/server/events.ts`; the status checks themselves, and `/api/status`, are unchanged.

**Consequences.**

- Adding `EVENTS_URL` during an outage sends `proxy_unreachable` after three more failed checks, then `proxy_recovered`, as for an outage that starts after the restart.
- `last-version.json` is still written without `EVENTS_URL`, as before: a start records its version so that, once a URL is set, the next release sends `deployed` (ADR-063).
- If `EVENTS_URL` is changed to another receiver during an outage, the new receiver gets only the `proxy_recovered`. Not handled: the record does not say which receiver was told. The same follows when `EVENTS_URL` is removed during an outage and later set to another receiver. `docs/deployment/releases.md` has the operator delete `proxy-alarm.json` with the restart that changes or removes the receiver, and unit tests hold both cases (FIX-11).

## ADR-065: Cloudflare in front of the site: the cache rule, a rate limit, and no `ADDRESS_HEADER`

Date: 2026-11-07 · Task: P5-02

**Context.** P5-02 sets up Cloudflare: DNS, the Tunnel, a cache rule and a rate-limiting rule on `/summoner/*` and `/match/*` (plan, "Cloudflare, set once"). DNS and the Tunnel have served production since it went live (ADR-038), and pages were seen going `MISS` then `HIT` (ADR-039, SPD-06), so a cache rule existed, but its settings were never recorded. There was no rate-limiting rule: the site has no limit of its own, so one client walking through profiles could spend the site's whole riot-proxy quota (600 requests a minute by default, shared by every visitor). The plan also says to set `ADDRESS_HEADER=CF-Connecting-IP`. The zone is on Cloudflare's Free plan.

**Decision.**

- **The cache rule, as it stands** (read in the dashboard by the owner, 2026-11-07). "Cache site pages", first in order: `(http.host eq "ninjagoldfinch.lol")`; eligible for cache; edge TTL "use cache-control header if present, bypass cache if not"; browser TTL "respect origin TTL"; cache key, stale-while-revalidate and the other options at their defaults, so the query string is in the key. The edge keeps exactly what `src/lib/server/cache.ts` says, and nothing without a `Cache-Control` header.
- **A rate-limiting rule** (owner, 2026-11-07). "Profile and match pages per IP": `(starts_with(http.request.uri.path, "/summoner/")) or (starts_with(http.request.uri.path, "/match/"))`, counted per IP, 20 requests per 10 seconds, then Block for 10 seconds. It covers profile and match pages, their `__data.json`, the Refresh form post and the old region URLs. Free allows one rule, fixes the period and the duration at 10 seconds, and has no option to leave cached responses out of the count, so edge `HIT`s count too.
  - **Block, not a challenge.** A page's `__data.json` on client-side navigation and a match expanded inline are fetched by the page's script, which cannot answer a challenge; they would fail instead.
  - **20 per 10 seconds** leaves room for a person clicking through a profile and expanding matches, and stops a script working through many profiles. If real visitors hit it (Security → Events), raise it to 30.
- **`ADDRESS_HEADER` stays unset** (owner, 2026-11-07). With it set, adapter-node's `getClientAddress` throws on a request without the header, and every request made on the host itself is one. `/api/status` catches that and treats the request as not local, so checks from the host would need the token (ADR-062). Nothing else reads the client address. Cloudflare's own rule counts visitors by their real address whatever the site sees.

**Consequences.**

- A response without `Cache-Control` bypasses the edge. ADR-045 and ADR-055 described such responses as cached for Cloudflare's default TTL; that is not what this rule does, whatever it did then. `handle`'s `no-store` fallback (ADR-045) stays, for browsers and in case the rule changes.
- A blocked visitor gets Cloudflare's 429 page, not the site's, for 10 seconds. Counters are kept per Cloudflare data centre, so a client spread across locations gets more than 20.
- `/champions`, `/champions/*`, `/`, `/about` and `/search` are not limited. The champion pages are analytics riot-proxy has already computed and the edge holds for 10 minutes; `/search` reads only the site's in-memory lookups and redirects a Riot ID to its profile, which the rule covers.
- On a paid plan the rule could block for longer and count only requests that reach the server.
- Checked from outside on 2026-11-07 (`docs/PROGRESS.md`, "P5-02 check"): 20 `200`s then `429`; a profile `EXPIRED` then `HIT`; `/champions` never blocked.

## ADR-066: the front page shows live data: a `live` policy, a 2 s front-page deadline, no streaming

Date: 2026-11-09 · Task: FP-01 · The games-analysed pill corrected by ADR-074; the top-win-rate card's filters and floor by ADR-077

**Context.** `/` had no proxy data and a 10-minute `static` policy (ADR-055). The owner's new front page ("Concept 1, search first with live cards") adds a patch pill, the ranked games analysed and the top win rates (FP-01), then the free rotation and server status for a region (FP-02). The rules it must keep: data loads only in `+page.server.ts`; pages work without JavaScript; each card fails on its own, and the page never fails because riot-proxy is slow; the CSP is hash-based (ADR-055); Cloudflare caches every page by its `Cache-Control`, with the query string in the key (ADR-065).

**Decision.**

- **One load, every call optional.** `loadFrontPage` (`src/lib/server/front-page.ts`) starts every card's call in one `Promise.all`, each through `optional()`. A part that failed is `null` and its card shows a notice ("Win rates are unavailable right now."). With every part loaded and the lookups not fallen back, `complete` is true and the page gets `live`; otherwise `none` (ADR-045).
- **A 2 s deadline for the cards.** The card calls go through `frontClient`, a client with `FRONT_PAGE_BUDGET_MS = 2_000`, counted for `/api/status` like the pages' (`src/lib/server/proxy.ts`). The usual budget would let a rotation or status call wait 30 s. The patch and its lookups stay on `proxy`: they are held in memory and loaded at start-up (ADR-048), and without them the page still renders, with no pill and no icons.
- **No streaming.** Without JavaScript a streamed card never fills in (ADR-039). SvelteKit also streams deferred data as inline scripts after the response's headers, CSP included, have gone out, so their hashes cannot be in it; they would need a nonce, which a page shared from the edge cannot have (ADR-055). The page waits for every card, at most about 2 s.
- **`live`: `public, s-maxage=60, stale-while-revalidate=120`.** A change in the server status shows within about three minutes; repeat views come from the edge. `static` stays for `/about`. `profile` has similar numbers, but a named policy says why and can change on its own.
- **The pills.** `Patch 16.20` is `major.minor` of the Data Dragon version already held for icons: no call. The games analysed are `totalGames` of the analytics call the top-win-rate card makes anyway (`/v1/lol/analytics/champions?queue=RANKED_SOLO_5x5&patch=all&minGames=0&limit=500`, as `/champions` asks), not a sum over `/v1/lol/analytics/patches`, a second call whose sum the spec does not say equals it.
- **The top win rates** are over every region, tier and patch, as `/champions` shows them. A champion needs 800 games to be listed (`TOP_WIN_RATE_MIN_GAMES`), applied in the page; `minGames=0` stays on the wire (ADR-035). The card links to `/champions?sort=win`. No MMR or ELO anywhere.

**Consequences.**

- Each edge miss on `/` costs riot-proxy one analytics call, answered from its memory; FP-02 adds two calls riot-proxy caches from Riot.
- While riot-proxy is down or slow, `/` is not kept at the edge: every view reaches the server and waits up to 2 s, then shows the notices. `/` is not rate limited (ADR-065).
- `/` now returns the champion names, so the header search suggests champions there too, as on `/champions`.

## ADR-067: the Docker preview path removed

Date: 2026-11-09 · Task: P5-01 (dropped; owner request)

**Context.** P5-01 brought forward a `Dockerfile`, `deploy/compose.yaml` and a Proxmox preview VM (`deploy/proxmox/`) for viewing P1 on the LAN (#13). Production has run without Docker since ADR-038, and releases are tarballs deployed by `ninja-actions` (ADR-052, ADR-053), with staging as the place to look at a release before prod (ADR-057). The preview VM has not existed since 2026-10-19. The files were kept, and `just check` still ran `deploy/proxmox/test.sh`, in case it came back. The owner asked for them to go (2026-11-09).

**Decision.**

- Removed: `Dockerfile`, `.dockerignore`, `deploy/compose.yaml`, `deploy/proxmox/` (`create-vm.sh`, `ninjagoldfinch-update`, its README and `test.sh`), `just image`, `tests/unit/deploy-test.test.ts` and `docs/deployment/preview-vm.md`.
- The gate (`scripts/check.sh`) loses its deploy test step and is otherwise unchanged; CI, releases and deploys run the same script, so nothing in `.github/workflows/` changes.
- P5-01 is dropped: its remaining checks (an image under 200 MB, `cloudflared` beside the container, no published port) were for the Docker path only.
- `deploy/systemd/` stays: it is production's.

**Consequences.**

- Nothing in the gate runs git any more, so the worktree hazard RV-01 and FIX-06 guarded against no longer applies.
- A LAN preview, if wanted again, is a new task: a release tarball runs anywhere with Node 22 (ADR-052), so it need not be Docker.
- The ADRs and notes that describe the preview VM stay as the record of what was.

## ADR-070: the P5 exit check reads riot-proxy as published only through its tunnel

Date: 2026-11-09 · Task: P5

**Context.** The plan's P5 exit check asks that "riot-proxy is unreachable from outside the VM". When the plan was written riot-proxy was a private service for this site. Since then riot-proxy has published itself at `https://api.ninjagoldfinch.lol` through the Tunnel, with key authentication and a WAF over its metrics, dashboard, dev, admin and docs paths, and `admin.ninjagoldfinch.lol` behind Cloudflare Access; staging reads from it with a key of its own (ADR-058). That is riot-proxy's decision, made in its own repo, and the site does not change it.

**Decision.**

- **The P5 exit check changes:** "`https://ninjagoldfinch.lol` serves a profile over HTTPS; riot-proxy's port is not reachable on the host's public address; at `https://api.ninjagoldfinch.lol` a data request without a key is refused with `401`, and riot-proxy's internal pages (metrics, dashboard, dev, admin, docs) are blocked at the edge with `403`; a rollback to the previous tag takes under five minutes". What riot-proxy serves without a key is its own decision, recorded in riot-proxy.
- As of riot-proxy 2.10.0, it answers some routes without a key on purpose, and the check does not fail on them: `/healthz`, `/readyz`, `/openapi.json`, `/openapi.yaml`, `/ddragon/*` (Data Dragon images and data files) and the `/v1/ws` handshake. The handshake reads the key from the `Authorization: Bearer` header or the `?token=` query parameter; a missing or bad key still gets its upgrade, then an error frame and a `4401` close, and a plain `GET` gets `400`. `/readyz` returns internal readiness detail to anyone: the Riot key's cache scope (a truncated hash), the SQLite reader and writer state, the version. The scope fingerprints the Riot key, so it would show a rotation without exposing the key. Whether to keep that is riot-proxy's call; it is noted here and not changed.
- The check is run from outside the host, against its public address and the public hostnames, without a key.

**Consequences.**

- What the original check protected still holds: riot-proxy's port is closed on the public interface, where only SSH listens (`docs/deployment/security.md`), and from outside riot-proxy is reached only through the Tunnel, where a data request needs a key and the internal pages are blocked at the edge. What it serves without a key is its own decision, recorded in riot-proxy.
- Whether riot-proxy stays public, and how it is guarded, is riot-proxy's to record and change.

## ADR-071: the front page's region in the query, Oceania by default; Riot's rotation and status payloads parsed, not typed

Date: 2026-11-09 · Task: FP-02 · Status entries, empty rotations, the Middle East and the cost of a degraded `/` refined by ADR-072; what the status card shows extended by ADR-075; the rotation card dropped by ADR-076

**Context.** The front page's free rotation and server status cards (ADR-066) are per platform. riot-proxy's `/v1/lol/rotations/{platform}` and `/v1/lol/status/{platform}` pass Riot's champion-v3 and lol-status-v4 payloads through with an empty schema, so the generated types have them as `unknown`. ADR-037 took the region out of search and profiles, but these two cards still need a platform. The site has no sessions or cookies.

**Decision.**

- **`?region=<slug>`**, a slug from `REGIONS`; Oceania (`oce`, `oc1`) when absent, the owner's platform and the fixtures'. Each region has one URL: `/` for Oceania, `/?region=kr` otherwise. Anything else (an unknown slug, upper case, `region=oce`, an extra parameter) redirects 307 to it, as `/champions` tidies its query (`pickRegion`, `frontQuery`).
- **A picker in each card's header** (`RegionPicker`): a GET `<select>` form, which applies on change with JavaScript and has a `<noscript>` Apply button without, like the champion filters. Both cards follow the one query.
- **What the site assumes of Riot's payloads**, read with `record()` and type guards, never a cast (`parseRotation`, `parseStatus` in `src/lib/domain/front-page.ts`):
  - champion-v3 `ChampionInfo`: `freeChampionIds` must be a list, of which integer entries are kept; `freeChampionIdsForNewPlayers` and `maxNewPlayerLevel` are optional.
  - lol-status-v4 `PlatformDataDto`: `incidents` and `maintenances` must be lists. An entry needs an integer `id` and a title: the `en_US` entry of `titles[].content`, else the first. `incident_severity` is kept only as `info`, `warning` or `critical`; `maintenance_status`, `updated_at` and `name` only as strings. Maintenances marked `complete` are dropped.
  - A payload that does not fit is logged (`front page: unexpected … payload for <platform>`) and its card shows a notice.
- **The status card** shows "All services running" when nothing is open, else each incident and maintenance with its severity or state, scheduled and in-progress maintenances alike. It has no per-service rows: the feed has none. "checked X ago" is riot-proxy's `X-Cache-Fetched-Age`, read only when it is a whole number of seconds.
- **The rotation card** shows the free champions the Data Dragon lookups know, by name, each linking to its champion page; an id the lookups lack is left out and logged. It does not say when the rotation resets: the payload does not.
- The fixtures for both routes are synthetic (no riot-proxy was reachable to record them), and the recorder now keeps `X-Cache-Fetched-Age`.

**Consequences.**

- `/` has 15 edge variants, one per region, each costing riot-proxy two calls per miss, which it answers from its own cache of Riot.
- Most visitors outside Oceania see Oceania first and pick their region once per visit. Remembering it (a cookie) or guessing it (geolocation) would be a later decision.
- A change in Riot's payloads shows as a logged notice and an uncached `/`, not an error page. If riot-proxy later types these routes, the generated types can replace the parsers.

## ADR-069: the gate reads `docs/PROGRESS.md`'s ticks

Date: 2026-11-09 · Task: FIX-12 · Duplicate rule widened to every task item by FIX-15 (review of #142)

**Context.** Nothing in the gate read `docs/PROGRESS.md`: `docs/_meta/check-docs.py` skips it with the plan and the ADRs, and `scripts/check.sh` only formats it. The review of #134 found that merging it would have left two `[x] P5-05` lines, since #136 had already ticked the task, and CI would have passed. The ticks are the record of what is done and which PR did it; a tick repeated, or made for a task the plan never defined, was a record error nothing caught.

**Decision.**

- `scripts/check-progress.ts`, run by `scripts/check.sh` after Prettier, fails the gate when a task id appears more than once as a task item in `docs/PROGRESS.md`, whether open (`- [ ]`), ticked (`- [x]`) or dropped (`- [~]`), or when a ticked or dropped id belongs to a family the plan defines and is not a task in `docs/IMPLEMENTATION.md`. As first written, the duplicate rule counted only ticked and dropped items, so a ticked item with an open copy of it, or two open copies, passed, and a section git repeated in a merge was caught only if one of its lines was ticked in both copies (review of #142, FIX-15). Every task item now counts, whatever its state; the unknown-id rule still reads ticked and dropped items only.
- The families are read from the plan's own task items (`- [ ] P5-01 …`), not listed in the script: today P0 to P5, FP, SPD, VS and RV. FIX, DEP and STAT are defined only in `PROGRESS.md`, as owner requests after the plan, so their ids are checked for duplicates only.
- A TypeScript script under `scripts/`, run by Node directly as `tests/record-fixture.ts` is, and imported by its unit test; no dependency added. It is not part of `check-docs.py`, which is a docs check run by hand, outside the gate, and skips `PROGRESS.md` on purpose.

**Consequences.**

- A tick for a new task in a family the plan defines needs the task in `IMPLEMENTATION.md` first, or the gate fails. A new family can start in `PROGRESS.md` alone, as DEP, STAT and FIX did.
- Ids defined only in `PROGRESS.md` are not checked for existence: a mistyped FIX id passes.
- Only a list item at column 0 with a checkbox counts; sub-bullets and prose that mention an id are not read. An open item for a task already ticked elsewhere fails: a task is listed once, in the state it is in.
- The script runs its check when Node is started with it, also through a symlinked path: it compares its own path with the real path of `process.argv[1]` (FIX-15). Before, through a symlink it did nothing and exited 0; the gate, which runs it by its plain path, was not affected.
- `tests/unit/gate.test.ts` pins the step in the gate's order; `tests/unit/progress-check.test.ts` covers both rules on fixtures, including an id listed twice with one copy open and a section duplicated with different ticks in each copy, and the script's exit codes, also through a symlinked path, and that the repository as it is passes.

## ADR-068: recent searches keep the profile's region, icon and Solo/Duo rank; older entries still read

Date: 2026-11-09 · Task: FP-03 · What a Refresh records refined by ADR-073

**Context.** Recent searches stored a Riot ID only (ADR-037), shown as plain links. The new front page (ADR-066) shows them as cards with the profile icon, the region, the rank and how long ago each was viewed. The profile page that records a search already has all of it. `/` must not call riot-proxy for these cards, and the list must still render nothing before hydration, since it lives in the visitor's browser.

**Decision.**

- **The profile records more.** Each view stores `region` (the profile's slug), `profileIconId`, `rank` (the Solo/Duo tier as the profile shows it, such as `Emerald III`, from `describeRanks` through `soloRankLabel`; never an estimate) and `viewedAt` (ms since the epoch). The key stays `recent-searches`, and the list still holds at most eight, newest first, one per player.
- **Every field but the Riot ID is optional.** `parseRecent` keeps each one only when it is well-formed: a region `REGIONS` knows, a non-negative integer icon, a non-empty rank, a positive finite time. A malformed field is dropped, not its entry. Entries stored before this change read as bare Riot IDs. Entries from before ADR-037 carry the region the profile loaded with, which is kept.
- **The card** shows the icon from the front page's held patch (`profileIconUrl`), or the game name's initial when there is no patch or icon. Its line reads `Oceania · Emerald III · viewed 2 minutes ago`, with whatever parts the entry has, and is left out when it has none. Ages come from `formatAge`, counted from the moment the list is read after mount.

**Consequences.**

- Each entry grows by a few dozen bytes in `localStorage`, still at most eight.
- No migration step: old entries show as plain cards and fill in as their profiles are viewed again. An icon, rank or region shown is as of the last view; it changes when the player's profile is next opened.
- The icon is fetched from Data Dragon at the front page's patch. An icon newer than that patch shows as a broken image until the patch moves, as on the profile.

## ADR-072: status entries kept whatever they lack, an empty rotation unavailable, no Middle East on the front page yet

Date: 2026-11-09 · Task: FIX-13 (review of #140; refines ADR-071)

**Context.** The review of #140 found four ways the front page's rotation and status cards (ADR-071) said less than they knew, or the wrong thing:

- `parseStatus` dropped, without a word, an incident or open maintenance that had no integer `id` or no usable title. A feed whose only incident was `{ id: 1, incident_severity: "critical", titles: [] }` read as nothing open: a green "All services running", nothing logged, and the page kept at the edge as complete.
- A rotation whose `freeChampionIds` was empty, held no integers, or named only champions the lookups lack came back as an empty list, not as unavailable. The card showed "Free rotation is unavailable right now.", nothing was logged, and the page was kept at the edge with the notice.
- The picker offered every entry of `REGIONS`, the Middle East (`me`, platform `me1`) included. riot-proxy's released 2.10.0 has no `me1` in its platform list and answers 400 for it, so both cards failed on every view of `/?region=me`, and that page was never kept at the edge. Read in riot-proxy's source at v2.10.0, not by a live call.
- Choosing a region with JavaScript scrolled the page to the top, unlike the site's other in-place controls.

**Decision.**

- **Every status entry is kept**, but completed maintenances, which are still dropped. One without a usable title shows as `Incident` or `Maintenance`, with its severity or state when that is readable. One without an integer `id` is keyed by its place in its list (`at-<n>`, otherwise `id-<id>`), which the card's list uses. An entry that is not an object at all is kept the same way, with nothing readable. `parseStatus` records what each entry lacked, and `readStatus` logs `front page: status entries shown with a fallback for <platform>: …` whenever one needed it. The page is still kept at the edge: the card shows that something is open.
- **A rotation with no champions to show is unavailable**: empty, without integer ids, or with only ids the lookups lack. `readRotation` logs `front page: no free champions to show for <platform>` and returns null, so the card shows its notice and `/` is sent `no-store`, as for a failed call.
- **The Middle East is left out of the front page's regions** (`FRONT_REGIONS`), in the picker and in `pickRegion`, so `/?region=me` redirects 307 to `/`. `REGIONS` itself is unchanged: profiles and matches use it, and riot-proxy names a player's platform for them. It comes back to the front page when a riot-proxy release accepts `me1`.
- **The picker keeps the scroll**: its form has `data-sveltekit-reset="false"`, as the champion table's sort links, the match tabs and the set-build tabs do. A Playwright test at a 390 px viewport saw the page go from `scrollY` 655 to 0 without it.

**Consequences.**

- `/` has 14 edge variants, not 15.
- A degraded `/` costs riot-proxy on every view. With a card missing, `/` is sent `no-store` (ADR-066), so the edge keeps nothing and each view makes three riot-proxy calls (analytics, rotation and status; the patch and lookups are held in memory), each counted against the site key's quota (600 a minute by default). `/` has no edge rate limit: the one rule covers `/summoner/` and `/match/` only (ADR-065). While riot-proxy, Riot's status or its rotation is failing, or for `/?region=` of a platform riot-proxy refuses, the front page's traffic reaches riot-proxy in full. ADR-071's consequence that riot-proxy answers these calls from its own cache of Riot holds for a working platform, not for this. A rate limit or a fallback held in memory for a degraded `/` would be a later decision.
- An entry kept under a fallback is logged on every render of that region's `/` while Riot's feed holds it; the edge still keeps the page for a minute at a time, per Cloudflare data centre.
- The log lines are in `docs/integration/monitoring-hooks.md` and `docs/operations/troubleshooting.md` (entry 22).

## ADR-073: a Refresh counts as a view of the profile

Date: 2026-11-09 · Task: FIX-14 (review of #141; refines ADR-068 and ADR-017)

**Context.** The profile records each view under recent searches from an effect (ADR-068). The effect read the load's `data`, while the page renders `profile`, which is `form?.profile ?? data`: after a Refresh, the action's fresh copy (ADR-012). The Refresh form calls `update({ invalidateAll: false })` on purpose, so `data` does not change and the effect neither ran again nor saw the new values. A profile shown at Emerald III from riot-proxy's cache and refreshed to Emerald II kept a front-page card reading Emerald III, with the earlier view time.

**Decision.** A Refresh counts as a view. The effect records from `profile`: its Riot ID, region slug, the summoner's `profileIconId` and `soloRankLabel` of its ranks, and the time. It runs again when the refresh's result arrives, as it does when one profile leads to another.

**Consequences.**

- After a Refresh, the card shows the refreshed icon and rank and "viewed just now". Without JavaScript nothing is recorded, by a view or a Refresh, as before.
- ADR-068's "it changes when the player's profile is next opened" now reads "next opened or refreshed".
- The refresh fixture (`tests/fixtures/profile-ninjagoldfinch-refresh.json`) was edited by hand to Emerald II, 12 LP and icon 29, so a test can tell a refresh's values from the plain profile's (Emerald III, icon 7173). This refines ADR-017, under which recorded fixtures stay unedited, by one narrow rule: a recording may be edited only when a test needs two recordings of the same path to differ, as here the profile with and without `?refresh=true`, and the fixture's `_note` must then begin "Edited:".

## ADR-074: the games-analysed pill counts games, a tenth of riot-proxy's `totalGames`

Date: 2026-11-10 · Task: FIX-17 (owner, 2026-11-10; corrects ADR-066)

**Context.** The front page's pill showed `totalGames` of `/v1/lol/analytics/champions` as "ranked games analysed" (ADR-066). In production it read 23,382,890; riot-proxy has analysed about 2.3 million games (owner, 2026-11-10). `totalGames` counts participant games, a game once for every champion in it: the spec says so of the patches route ("Participant games, as `totalGames` counts them on the champions route", `AnalyticsPatchEntry.games`), and in the recording it is the sum of every row's `games` (211,590). The champions route has no count of matches: `pickRate` is a share of them, rounded to four places, so they cannot be read back from it exactly.

**Decision.**

- The pill shows `totalGames / 10`, rounded down (`gamesAnalysed` in `src/lib/domain/front-page.ts`). The front page asks for Ranked Solo/Duo over every role, tier, side and patch (`FRONT_FILTER`), so every participant of every game is counted, and a Summoner's Rift game has ten. The recording's total, each of its patches' and production's are all whole multiples of ten.
- Only the front page divides. `/champions` rows show their own `games`, which are that champion's, and the champion page's "games with a build" is the builds route's `totalGames`, one champion's games in a role: each of those is already one game.
- This is arithmetic on what the spec documents, not a count riot-proxy gives. **Wanted from riot-proxy:** a `totalMatches` on `ChampionStatsResponse`, the matches in the slice each counted once (the denominator `pickRate` already uses). When the spec has it, the pill reads it and `gamesAnalysed` goes.

**Consequences.**

- The pill reads about a tenth of what it did: 21,159 against the fixture, about 2.3 million in production.
- A slice that is not ten a game would be wrong by this rule: a role or tier filter, or a queue with another team size. `FRONT_FILTER` has none, and a unit test pins that the recording's `totalGames` is the rows' sum and a multiple of ten.

## ADR-075: the status card shows the feed's updates and ages, worst first, and links to Riot's status page

Date: 2026-11-10 · Task: FP-04 (owner, 2026-11-10; extends ADR-071 and ADR-072)

**Context.** With nothing open, the status card (ADR-071) was one line over an empty card; with something open, a title and a severity. The owner asked for it to be improved, and for what riot-proxy would have to change to be labelled. The site may read Riot's status only through riot-proxy, whose `/v1/lol/status/{platform}` passes one platform's lol-status-v4 `PlatformDataDto` through. That payload has more than the card read (each entry's `updates[]`, `created_at` and `updated_at`), and nothing at all about a platform that is clear, about other platforms, or about what has closed.

**Decision.**

- **The card shows everything the feed has that a visitor can use.** A first line counts what is open (`2 incidents · 1 maintenance`) beside a dot for the worst entry. Each entry has its title, `Incident · warning · updated 3 hours ago`, and the text of its newest update, cut at three lines.
- **More the site assumes of the payload**, read as ADR-071 reads the rest, never a cast (`latestUpdate`, `statusView` in `src/lib/domain/front-page.ts`):
  - `updates[]`: each update's text is `translations[].content`, the `en_US` entry else the first, as for `titles[]`. An update with `publish: false`, or with no text, is passed over. The newest is the one with the latest `updated_at`, else `created_at`; an update without a readable time counts as the oldest, and of equals the first in the list wins. This is Riot's documented DTO, not a recording: both status fixtures are synthetic.
  - `updated_at`, else `created_at`, of the entry, as RFC 3339 times: `updated …` or `opened …`. Neither readable: no age. A time ahead of the server's clock reads `just now`.
- **Worst first** (`STATUS_ORDER`): critical incidents; warnings, with an incident whose severity is unreadable (open, so never less than a warning, ADR-072) and a maintenance `in_progress`; `info` incidents; then any other maintenance. Within one, the feed's order. A dot per tone: `loss` red, a new `warn` amber, `muted`, `accent`. Before, every incident but an `info` was red.
- **Ages are counted in the load**, from the server's clock (`loadFrontPage`'s `now`), and sent as seconds, so the page hydrates to the text it was rendered with. They are as old as the edge's copy of the page: up to three minutes (ADR-066), as "checked X ago" already is.
- **All clear fills the card**: a green mark, "All services running" and "No open incidents or maintenance on Oceania.", centred. The feed has nothing more to say of a platform that is clear.
- **A link to Riot's status page** for the region, `https://status.riotgames.com/lol?region=<platform>&locale=en_US` (`riotStatusUrl`), in every state, the unavailable one included: it has the whole of each update, Riot's recently closed entries and its other games. `rel="external noreferrer"`, same tab. Loaded in a browser for `oc1` and `kr` on 2026-11-10. It is the site's first link to a page that is not its own; the owner approved it on 2026-11-10.
- **What needs riot-proxy is not built.** Other regions at a glance, recently closed entries and typed payloads are labelled RP-1 to RP-3 in `docs/notes/status-card.md`, with the tasks they would unlock; RP-4 (`me1`, ADR-072) and RP-5 (`totalMatches`, ADR-074) are listed there too. The site does not ask the per-platform route fourteen times instead: fourteen calls inside the 2 s deadline for every uncached view, each against the key's quota, and one failure would send `/` as `no-store` (ADR-072).

**Consequences.**

- The card's data is `StatusView` (counts and entries), shaped in the load; `PlatformStatus` stays what `parseStatus` returns and what the fallback log reads.
- An update's text is Riot's, in whatever language the platform has when there is no `en_US`; it is rendered as text, never as HTML.
- An entry's age moves with the clock, so the browser test checks its form, not its value; the unit tests pin the clock.
- A real recording of a feed with something open would confirm the order of `updates[]` and whether unpublished updates appear. Until then the newest-by-time rule does not depend on either.

## ADR-076: the front page drops the free-rotation card

Date: 2026-11-10 · Task: FP-08 (owner, 2026-11-10; supersedes the rotation card of ADR-066, ADR-071 and ADR-072)

**Context.** The front page's row of live cards (ADR-066) had three: the free rotation, the top win rates and the server status, the first and last for `?region=` (ADR-071). The owner asked for the rotation card to go and for the win-rate card to get more room and more filters. The rotation was also the card most often shown as a notice: an empty or unnamed rotation counts as unavailable (ADR-072), as Brazil's did on 2026-11-10, and a missing card sends `/` as `no-store`.

**Decision.**

- **No free-rotation card.** `RotationCard`, `parseRotation`, `rotationChampions` and the synthetic rotation fixtures are removed, and `loadFrontPage` no longer calls `/v1/lol/rotations/{platform}`.
- **Two cards in the row**: on a wide screen the top win rates take two of the three columns and the server status the third; stacked on a narrow one, as before.
- **`?region=` stays**, for the status card, with its one picker. Its URLs, the Middle East's exclusion and the 307s are unchanged (ADR-071, ADR-072).

**Consequences.**

- A front-page miss costs riot-proxy two calls (analytics and status), not three, and `/` is complete, so kept at the edge, whenever those two and the lookups are.
- The front page's exit check reads Korea's status, not its rotation and status.
- The site makes no use of riot-proxy's rotations route. RP-2 in `docs/notes/status-card.md` asks for a schema for the status route only.

## ADR-077: the top-win-rate card slices by patch, role and tier, ranks by win, pick or ban rate, and lowers its floor to fill

Date: 2026-11-10 · Task: FP-09 (owner, 2026-11-10; extends ADR-066 and ADR-071)

**Context.** The front page's top-win-rate card (ADR-066) listed the six highest win rates over 800 games, every patch, role and tier summed. The owner asked for 7-day, 30-day and this-patch filters, a role filter and other useful stats. riot-proxy's `/v1/lol/analytics/champions` slices by `patch` (one `major.minor`, or `all`), `role`, `tier` or `minTier`, `queue` and `side`; it has no window in days, as its tables are aggregated per patch. The site may not work around that (CLAUDE.md). Asked on 2026-11-10, the owner chose: this patch and all patches now, with 7D and 30D raised with riot-proxy; a tier filter, pick and ban rates, and a sort; and a floor of games that scales with the slice, 800 for the default.

**Decision.**

- **The card's view is in the query, in `/champions`' words**: `role` (`top` … `support`), `rank` (`diamond`, `diamond+`), `patch=newest` for this patch, `sort` (`pick`, `ban`). Defaults are left out: every role and tier, all patches, by win rate. The card offers no patch by number: any `patch` but `newest` is all patches (`parseFrontCard`). The query is canonical with the region first (`frontQuery`: `?region=kr&role=mid&rank=diamond+&patch=newest&sort=pick`), and anything else redirects 307 to it, as `?region=` did alone (ADR-071).
- **"This patch" is riot-proxy's newest aggregated patch**: the call leaves `patch` out, and the card names the patch riot-proxy answered with (`Patch 16.20`). It can be newer or older than the Data Dragon patch in the hero's pill.
- **Controls that work without JavaScript**: links for the patch and role tabs and for the Win rate, Pick rate and Ban rate column headings, which sort, as on `/champions`; a GET form for the tier, applied on change with JavaScript and by a `<noscript>` Apply button without. Every control keeps the region and the rest of the view; the status card's region picker keeps the card's view as hidden inputs. All keep the scroll (`data-sveltekit-reset="false"`, ADR-072).
- **Each row shows its win, pick and ban rates and its games**, the sorted one in bold; the games and a bar are left out on narrow screens. The bar is the win rate on its fixed scale (`winRateBar`), or a pick or ban rate against the card's highest (`rateBar`). The link to `/champions` carries the view.
- **A floor that fills the card** (`gamesFloor`): the first of 800, 400, 200 and 100 games that six champions reach, else 100. The default slice keeps 800 in production and in the fixtures; a new patch or a narrow role and tier still lists six. It never goes under 100, where `/champions` marks a low sample (ADR-035). The same floor applies to every sort: a ban rate counts every match, not the role's, so without it a role's top bans would be champions barely played in it. The card shows the floor it used (`All patches · Mid · min. 800 games`), and with no champion over 100 says so for the slice.
- **The games-analysed pill still counts the default slice** (ADR-074): when the card is filtered, the load makes a second analytics call for the pill, and logs `front page: games analysed unavailable: <status>` if only that one fails. A sort alone is the same slice, so one call.
- **7D and 30D wait on riot-proxy**: labelled RP-6 in `docs/notes/status-card.md`, with FP-10 to bring them to the card once a release has it.

**Consequences.**

- `/` has far more edge variants: up to 14 regions × 2 patches × 6 roles × 20 tier choices × 3 sorts. Each miss costs riot-proxy at most three calls (the card's slice, the pill's and the status), all answered from riot-proxy's memory or cache; a degraded view still costs them on every view (ADR-072).
- A filtered view is complete, so kept at the edge, only when both analytics calls and the status answered.
- A tier form submitted without JavaScript sends `rank=diamond%2B`, which redirects once to `rank=diamond+`, as on `/champions`.
- The newest-patch fixture is synthetic: the 16.19 recording at the path without `patch`, relabelled 16.20, which riot-proxy's patch list names as its newest.
