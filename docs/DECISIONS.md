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
