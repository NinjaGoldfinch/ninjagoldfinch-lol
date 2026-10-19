# 0006: The site's origin is fixed at build time

`ORIGIN` is read when the site is built, not when it runs, because adapter-node 6 no longer reads it at runtime and form posts are checked against it.

## Context

adapter-node 6 takes the origin from `paths.origin` in the build config, or else derives it from the `Host` header assuming `https`. On the HTTP preview VM every form POST (Refresh) was refused as cross-site with 403 (ADR-014, `docs/DECISIONS.md:175`).

## Decision

- `vite.config.ts:16-19` sets `paths.origin` from `ORIGIN` when it is set at build time.
- Production builds with `env ORIGIN=https://ninjagoldfinch.lol pnpm build` (`README.md:109-113`).
- The Docker build takes `ORIGIN` as a build argument (`Dockerfile:9-11`).
- Playwright runs the real `node build` with `ORIGIN` set, not `vite preview` (`playwright.config.ts:15-31`).

## Consequences

- Changing the public hostname means rebuilding.
- `ORIGIN` is not in `/etc/ninjagoldfinch-lol/env` (owner-supplied names, 2026-10-19).
- Cross-origin POSTs are refused with 403 (observed 2026-10-19).

## Status

Accepted.

## Evidence

ADR-014, `tests/e2e/routes.test.ts` refresh tests.

---

**Sources:** `docs/DECISIONS.md:L171-L183`, `vite.config.ts:L16-L19`, `README.md:L109-L113`, `Dockerfile:L9-L11`, `playwright.config.ts:L15-L31`
**Last verified:** 2026-10-19 against commit `85d9cf8`
