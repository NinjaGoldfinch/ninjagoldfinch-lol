# CLAUDE.md — ninjagoldfinch.lol

Server-rendered SvelteKit site in front of riot-proxy. The plan and task list
live in docs/IMPLEMENTATION.md. Read it before doing anything.

## Non-negotiables

- One task -> one branch -> one PR -> squash-merge. Never commit to main.
  Never batch tasks.
- Every PR ships tests for the behaviour it adds or changes.
- `just check` passes before a task is done. It runs scripts/check.sh, the
  one gate, which CI also runs on every PR (.github/workflows/ci.yml).
  CI, releases and deploys follow the shared pipeline in
  NinjaGoldfinch/ninja-actions (ADR-050); change them only through a task
  and an ADR.
- No secrets. PROXY_KEY lives only in .env. Fixtures are redacted: no
  `rpx_` and no `RGAPI-` strings anywhere in the repo.
- The proxy key never reaches the browser. Anything that reads it lives
  under src/lib/server/. Never import src/lib/server/ from client code,
  and never put a secret in a PUBLIC_ variable.
- Never call Riot directly. All data comes from riot-proxy through
  src/lib/server/proxy.ts. If the proxy lacks something, stop and ask;
  do not work around it.
- Never invent proxy semantics. Routes, fields, headers and error codes
  come from openapi/riot-proxy.json. Unknown -> ask.
- Never hand-edit src/lib/api/schema.d.ts. Run `just gen`.
- Riot policy: no MMR or ELO estimates, no custom-queue match history,
  legal boilerplate stays in the footer of every page.
- Stop and ask on ambiguity, unmet acceptance criteria, or a new runtime
  dependency.
- Log decisions in docs/DECISIONS.md (ADR-nnn). Tick tasks in
  docs/PROGRESS.md with the PR number.

## Layout

src/lib/server/      proxy client, env, cache helpers (server only)
src/lib/api/         generated OpenAPI types
src/lib/domain/      pure functions, each with a unit test
src/lib/components/  Svelte components
src/routes/          pages; +page.server.ts loads, +page.svelte renders
tests/unit/          Vitest
tests/e2e/           Playwright against the mock proxy
tests/fixtures/      redacted proxy responses
openapi/             committed copy of the riot-proxy spec
deploy/              systemd drop-in for the production host
.github/workflows/   CI (the gate); release and deploy later (ADR-050)
scripts/check.sh     the gate itself

## Commands

just setup    install, enable git hooks, create .env
just dev      dev server
just gen      regenerate API types from openapi/riot-proxy.json
just check    format, progress ticks, spec drift, lint, svelte-check,
              unit tests, build, release package test
just e2e      Playwright smoke tests

## Conventions

- Svelte 5 runes only ($state, $derived, $props, $effect). No Svelte 4
  syntax: no `export let`, no `$:`, no stores for component state.
- Data loads in +page.server.ts. No client-side fetching of proxy data,
  no remote functions.
- Pages work without client JavaScript; enhance on top.
- TypeScript strict. No `any`; no non-null `!` on proxy data.
- Tailwind utilities with tokens from src/app.css. No inline hex colours.
- Every load sets Cache-Control through src/lib/server/cache.ts.
- Asset URLs only through src/lib/assets.ts.
- Conventional Commits, scoped: `feat(profile): ...`, footer `Task: P2-03`.
- Branch: <type>/<task-id>-<slug>.
- Commit messages and PR descriptions describe the change only. No AI
  attribution of any kind: no generated-with lines, no co-author
  trailers, no session links.

## Phase gates

After a phase's exit check passes: paste the result into
docs/PROGRESS.md, tag phase-P<n>, and pause for owner review before the
next phase.
