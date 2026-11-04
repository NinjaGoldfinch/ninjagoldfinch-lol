# CI

What runs on GitHub for this repository, and how to reproduce it locally. The rule behind it is ADR-050.

## `ci.yml`

Every pull request and every push to `main` run one job, `just check`:

1. Check out, with no credentials left in the checkout.
2. Node 22 (`actions/setup-node`), then `corepack enable`, which provides pnpm at the version `package.json`'s `packageManager` names.
3. `pnpm install --frozen-lockfile`.
4. `cp .env.example .env`: the unit tests load the server env, and the example's values are placeholders.
5. `scripts/check.sh`, the gate: Prettier, the schema drift check, ESLint, `svelte-kit sync`, svelte-check, Vitest, the build and `deploy/proxmox/test.sh`.

A pull request from this repository runs on the self-hosted Proxmox runner (`self-hosted, linux, proxmox`); one from a fork runs on `ubuntu-24.04`, so outside code never reaches that runner, and the repository requires approval before an outside contributor's workflows run. The token is read-only and the job reads no secrets. Every action is pinned to a commit.

`tests/unit/gate.test.ts` keeps this wiring honest: `just check` and the pre-push hook run `scripts/check.sh`, the script runs the steps above in order and stops at the first failure, and `ci.yml` runs it with the fork rule, a read-only token and pinned actions.

## Locally

`just check` runs the same script; the pre-push hook runs `just check`. `just e2e` (Playwright against the mock proxy) is not part of the gate.

---

**Sources:** `.github/workflows/ci.yml`, `scripts/check.sh`, `justfile`, `.githooks/pre-push`, `tests/unit/gate.test.ts`, `docs/DECISIONS.md` (ADR-050)
**Last verified:** 2026-11-05 against commit `31d3eed`
