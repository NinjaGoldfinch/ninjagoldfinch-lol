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
