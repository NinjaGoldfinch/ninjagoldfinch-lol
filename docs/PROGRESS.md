# Progress

Task ticks with the PR that delivered them. Task definitions are in [IMPLEMENTATION.md](IMPLEMENTATION.md).

## P0 — Repository and tooling

- [x] P0-01 Scaffold with `sv`, Node adapter, Tailwind, Vitest, Playwright, ESLint, Prettier — first commit on `main` (6dc9048), no PR because the repo was empty
- [x] P0-02 Create the private repo and push — no PR; GitHub UI settings are for the owner to apply
- [x] P0-03 `justfile`, `.githooks/`, `.env.example`, `.gitignore`, `.dockerignore` — #1
- [x] P0-04 `README.md`, `docs/DECISIONS.md`, `docs/PROGRESS.md`, `openapi/riot-proxy.json` — #2 (CLAUDE.md and `docs/IMPLEMENTATION.md` came with P0-01)
- [x] P0-05 `src/lib/server/env.ts` and `src/env.ts` with start-up validation and tests — #3

## Open decisions resolved

- SvelteKit 3 is stable; scaffolded on 3.x. ADR-001.
- riot-proxy OpenAPI JSON is served at `/openapi.json`. Recorded in the README.
- GitHub does not offer branch protection for this private repo on the current plan. ADR-003.
- Environment handling follows SvelteKit 3 (`src/env.ts`, `$app/env/private`). ADR-004.
