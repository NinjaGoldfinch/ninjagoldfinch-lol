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

Date: 2026-10-09 · Task: P2-03 (follow-up)

**Decision.** `MatchRow` lays a game's items out as two rows of four, as the game's own scoreboard does: item slots 0–2 then the trinket (slot 6) on the first row, slots 3–5 then the role quest slot on the second. So the trinket is always slot 4 and the role quest slot always slot 8. The role quest slot (`roleBoundItem`) is kept only when `teamPosition` is `BOTTOM`, where it holds the bot laner's boots. Other roles' quest rewards (for example the Mid Lane Quest Reward) say nothing useful and are dropped, so their slot 8 stays blank.

**Consequences.** Only bot laners' boots are guaranteed to be in slot 8. Other roles buy boots into the inventory, and they show in whichever slot the player put them. The site does not move them.
