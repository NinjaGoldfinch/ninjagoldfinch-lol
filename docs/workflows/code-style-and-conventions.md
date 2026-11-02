# Code style and conventions

The formatting, lint, naming, error-handling, logging and commit rules for ninjagoldfinch.lol, with the file that sets or enforces each one. `CLAUDE.md` is the authority; this page collects and explains it.

## Formatting: Prettier

`just check` starts with `prettier --check .` (`justfile:20`); fix with `pnpm format` (`package.json:17`).

| Setting         | Value                                                                                         | Source                   |
| --------------- | --------------------------------------------------------------------------------------------- | ------------------------ |
| Indentation     | tabs                                                                                          | `prettier.config.js:3`   |
| Quotes          | single                                                                                        | `prettier.config.js:4`   |
| Trailing commas | none                                                                                          | `prettier.config.js:5`   |
| Line width      | 100                                                                                           | `prettier.config.js:6`   |
| Plugins         | `prettier-plugin-svelte`, `prettier-plugin-tailwindcss` (sorts classes against `src/app.css`) | `prettier.config.js:7-9` |

Prettier also formats Markdown, including everything under `docs/`. Excluded: lockfiles, `static/`, `CLAUDE.md`, `docs/IMPLEMENTATION.md`, `openapi/` (byte-identical to riot-proxy), the generated `src/lib/api/schema.d.ts`, and `tests/fixtures/builds/*.json` (copied from riot-proxy) (`.prettierignore:1-22`).

## Lint and type checks

- **ESLint** (`pnpm eslint .`, `justfile:23`): `@eslint/js` recommended, `typescript-eslint` recommended, `eslint-plugin-svelte` recommended, then `eslint-config-prettier` so style rules never fight Prettier. It ignores whatever `.gitignore` ignores and `schema.d.ts`; `no-undef` is off as typescript-eslint advises, and `@typescript-eslint/no-non-null-assertion` is an error, enforcing CLAUDE.md's rule against `!` (`eslint.config.js:11-43`, RV-09).
- **TypeScript** is strict (`tsconfig.json:4`) and `svelte-check` runs over `src`, `tests` and the configs (`justfile:25`, `tsconfig.json:7`).
- **No `any`, and no non-null `!` on proxy data** (`CLAUDE.md:60`). Proxy data is either a generated type or passes a hand-written parser that returns `undefined` when it cannot read it (`src/lib/api/match.ts:1-4`).

## Svelte and styling

- Svelte 5 runes only: `$state`, `$derived`, `$props`, `$effect`. No `export let`, no `$:`, no stores for component state (`CLAUDE.md:55-56`). Runes mode is forced for every file outside `node_modules` (`vite.config.ts:10-13`).
- Tailwind utilities with the colour tokens defined in `src/app.css:6-16` (`bg-surface`, `text-muted`, `text-accent`, `text-win`, `text-loss`, …). No inline hex colours (`CLAUDE.md:61`).
- Asset URLs only through `src/lib/assets.ts` (`CLAUDE.md:63`).
- Pages work without JavaScript; enhancements go on top (`CLAUDE.md:59`). Filters are GET forms; Refresh is a POST form action.

## Where code goes and how it is named

| Kind                  | Location              | Naming                                              | Example                                   |
| --------------------- | --------------------- | --------------------------------------------------- | ----------------------------------------- |
| Pure functions        | `src/lib/domain/`     | kebab-case `.ts`, one concern per module            | `champion-stats.ts`, `riot-id.ts`         |
| Server-only code      | `src/lib/server/`     | kebab-case `.ts`; loaders named after pages         | `champion-page.ts`, `proxy.ts`            |
| Payload types/parsers | `src/lib/api/`        | named after the source                              | `match.ts`, `ddragon.ts`, `cdragon.ts`    |
| Components            | `src/lib/components/` | PascalCase `.svelte`                                | `MatchRow.svelte`, `SetBuilds.svelte`     |
| Unit tests            | `tests/unit/`         | `<module>.test.ts`; loaders `<page>-loader.test.ts` | `riot-id.test.ts`, `match-loader.test.ts` |
| Fixtures              | `tests/fixtures/`     | kebab-case; `synthetic-` prefix if hand-written     | `match-oc1-712351051.json`                |

Imports use the `#lib/*` subpath alias with the `.ts` extension, for example `import { proxy } from '#lib/server/proxy.ts'` (`package.json:45-47`). Never import `src/lib/server/` from client code, and never put a secret in a `PUBLIC_` variable (`CLAUDE.md:15-17`). Validated settings are read from `$app/env/private`, and only under `src/lib/server/` (ADR-004, `docs/DECISIONS.md:41-55`; `src/lib/server/proxy.ts:3`).

## Error handling

- A visitor sees one of three error states: 404 "Not found", 429 "Too many requests" (with `retryAfter` when known) and 503 "Temporarily unavailable". Raw riot-proxy messages are never passed through (`src/lib/server/errors.ts:6-33`).
- Throw with SvelteKit's `error(status, …)`. For an essential riot-proxy call use `toHttpError(response, body)`; for an optional one wrap it in `optional(...)` and degrade the page (`src/lib/server/errors.ts:35-58`).
- Anything unexpected (a bug, an unreachable riot-proxy) reaches `handleError`, which logs `error <METHOD> <path>:` with the detail and shows "Temporarily unavailable" (`src/hooks.server.ts:21-29`).
- Errors and form posts are never cached at the edge; the hook enforces it whatever the load set. A response no load gave a policy, such as a redirect, gets `no-store` (`src/hooks.server.ts:5-19`).

Full mapping: [api/errors.md](../api/errors.md).

## Logging

Logging is `console.error` and `console.warn` to stdout/stderr, which systemd sends to the journal. There is no logging library or structured format. Conventions in the existing lines:

- Start with the subsystem: `proxy …`, `match <id>: …`, `error GET /path:`.
- Include riot-proxy's `X-Request-Id` for any failed proxy response, so the line can be found in riot-proxy's logs (`src/lib/server/proxy.ts:7-20`, ADR-007).
- No line logs the proxy key or a payload body (every `console.*` call under `src/` was read on 2026-10-20). Failed-call lines do log the request path, which for `/v1/players/{puuid}/matches` contains a PUUID, and profile lines name the Riot ID (`src/lib/server/proxy.ts:16-18,127-128`, `src/lib/server/profile.ts:83,111`); the journal is therefore not public data.

The complete list of log lines is in [integration/monitoring-hooks.md](../integration/monitoring-hooks.md).

## Commits, branches and PRs

| Rule                                                                                                                                               | Source                       |
| -------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------- |
| One task, one branch, one PR, squash-merged; never commit to `main`; never batch tasks                                                             | `CLAUDE.md:8-9`              |
| Branch name `<type>/<task-id>-<slug>`, e.g. `chore/VS-01-spec-2.7.0`                                                                               | `CLAUDE.md:65`, `git branch` |
| Conventional Commits with a scope: `feat(profile): …`; footer `Task: <id>`                                                                         | `CLAUDE.md:64`               |
| Messages and PR descriptions describe the change only: no AI or tool attribution, no generated-with lines, no co-author trailers, no session links | `CLAUDE.md:66-68`            |
| Every PR ships tests for what it adds or changes                                                                                                   | `CLAUDE.md:10`               |
| Decisions as ADRs in `docs/DECISIONS.md`; tick the task in `docs/PROGRESS.md` with the PR number                                                   | `CLAUDE.md:28-29`            |

Types used in history: `feat`, `fix`, `docs`, `chore`, `style`, `perf`, `test`, `revert`. Common scopes: `profile`, `match`, `champions`, `api` (spec bumps), `progress`, `deploy`, `proxy`, `patch` (`git log --format=%s`). A squash-merged commit's subject ends with the PR number, its body explains what changed and why, and ends with the `Task:` footer, for example `eb09022 feat(champions): builds against a lane opponent (#68)` … `Task: VS-03`.

## Dependencies

A new runtime dependency needs the owner's agreement first (`CLAUDE.md:26-27`). The only runtime dependency today is `openapi-fetch` (`package.json:48-50`); see [reference/dependencies.md](../reference/dependencies.md).

---

**Sources:** `CLAUDE.md:L8-L29,L55-L68`, `prettier.config.js:L1-L12`, `.prettierignore:L1-L22`, `eslint.config.js:L11-L43`, `tsconfig.json:L1-L8`, `vite.config.ts:L10-L13`, `justfile:L19-L28`, `package.json:L17,L45-L50`, `src/app.css:L6-L16`, `src/lib/server/errors.ts:L6-L58`, `src/lib/server/proxy.ts:L3,L7-L20`, `src/hooks.server.ts:L5-L29`, `src/lib/server/profile.ts:L83,L111`, `docs/DECISIONS.md:L41-L55`, `src/lib/api/match.ts:L1-L4`, `git log --format=%s`, `git branch -a`
**Last verified:** 2026-11-03 against commit `2658c48`
