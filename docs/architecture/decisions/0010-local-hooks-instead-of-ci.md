# 0010: No CI; `just check` is the gate, run by a git hook

The repo has no GitHub Actions. One command, `just check`, defines "passing", and the pre-push hook runs it.

## Context

The plan keeps CI/CD out of scope and asks for Actions to be disabled on the private repo (`docs/IMPLEMENTATION.md:19,92`). GitHub branch protection is unavailable for this private repo on the current plan (ADR-003, `docs/DECISIONS.md:35`).

## Decision

- `just check` runs Prettier, the schema drift check, ESLint, `svelte-kit sync`, svelte-check, Vitest, the build and `deploy/proxmox/test.sh` (`justfile:20-28`).
- `.githooks/pre-push` runs it; `.githooks/pre-commit` refuses commits on `main` and added lines matching `(rpx_|RGAPI-)[A-Za-z0-9_-]` (ADR-002). `just setup` enables the hooks (`justfile:5-9`).
- Do not add GitHub Actions or any CI/CD config (`CLAUDE.md:11-12`).

## Consequences

- Nothing on GitHub stops a direct push to `main` (`docs/DECISIONS.md:39`).
- E2E tests (`just e2e`) are not part of the gate.
- A future pipeline would call the same command (`docs/IMPLEMENTATION.md:323`).

## Status

Superseded on 2026-11-05 by ADR-050 (`docs/DECISIONS.md`): CI runs the gate, now `scripts/check.sh`, on every pull request, and releases and deploys follow the shared pipeline. The hooks stay.

## Evidence

`.githooks/pre-commit`, `.githooks/pre-push`, `docs/PROGRESS.md:83-101` (P0 exit check).

---

**Sources:** `justfile:L1-L28`, `.githooks/pre-commit:L1-L27`, `.githooks/pre-push:L1-L3`, `CLAUDE.md:L11-L12`, `docs/IMPLEMENTATION.md:L19,L92,L323`, `docs/DECISIONS.md:L21-L39`
**Last verified:** 2026-10-19 against commit `85d9cf8`
