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
- [x] P1-04 Root layout: header, search form, footer with Riot boilerplate, `+error.svelte`, design tokens; region table moved here from P1-05 — #9
- [x] P1-05 `/`, `/about`, `/healthz`; `parseRiotId` with unit tests; `/search` redirect and minimal profile page for the exit check — #10
- [x] P1-06 `src/lib/assets.ts`, `ChampionIcon`, and `currentPatch` from the proxy'''s versions route — #11

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
