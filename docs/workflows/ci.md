# CI

What runs on GitHub for this repository, and how to reproduce it locally. The rule behind it is ADR-050.

## `ci.yml`

Every pull request and every push to `main` run two jobs, `just check` and `just e2e`. `release.yml` calls the same workflow before it builds a release, so a release has passed both. `just check`:

1. Check out, with no credentials left in the checkout.
2. Node 22 (`actions/setup-node`), then `corepack enable`, which provides pnpm at the version `package.json`'s `packageManager` names.
3. `pnpm install --frozen-lockfile`.
4. `cp .env.example .env`: the unit tests load the server env, and the example's values are placeholders.
5. `scripts/check.sh`, the gate: Prettier, the schema drift check, ESLint, `svelte-kit sync`, svelte-check, Vitest, the build and `deploy/proxmox/test.sh`.

A pull request from this repository runs on the self-hosted Proxmox runner (`self-hosted, linux, proxmox`); one from a fork runs on `ubuntu-24.04`, so outside code never reaches that runner, and the repository requires approval before an outside contributor's workflows run. The token is read-only and the job reads no secrets. Every action is pinned to a commit.

`just e2e` runs the browser tests (ADR-059): the same checkout, Node, install and `.env` steps, then `pnpm exec playwright install --with-deps chromium` and `pnpm playwright test`, what `just e2e` runs. Playwright builds the site, starts `node build` and the mock riot-proxy, and drives Chromium. It always runs on `ubuntu-24.04`: Chromium needs system libraries the self-hosted runner lacks, and that runner's user has no sudo to add them. Like `just check`, it reads no secrets with a read-only token.

`tests/unit/gate.test.ts` keeps this wiring honest: `just check` and the pre-push hook run `scripts/check.sh`, the script runs the steps above in order and stops at the first failure, and `ci.yml` runs it with the fork rule, a read-only token and pinned actions; the e2e job runs `just e2e`'s command on a hosted runner with no secrets, and `release.yml` runs both first.

## Locally

`just check` runs the same script; the pre-push hook runs `just check`. `just e2e` runs the browser tests as CI does; it is not in the pre-push hook, so run it before pushing a change to pages or scripts.

---

**Sources:** `.github/workflows/ci.yml`, `scripts/check.sh`, `justfile`, `.githooks/pre-push`, `tests/unit/gate.test.ts`, `docs/DECISIONS.md` (ADR-050, ADR-059)
**Last verified:** 2026-11-05 against commit `31d3eed`
