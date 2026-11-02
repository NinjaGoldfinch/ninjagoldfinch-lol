# 0002: The proxy client is typed from riot-proxy's own OpenAPI spec

All riot-proxy calls go through one openapi-fetch client whose types are generated from a committed copy of riot-proxy's spec, so a proxy change shows up as a diff and as type errors.

## Context

The dependency rule asks why hand-written code is not enough for any runtime dependency (`docs/IMPLEMENTATION.md:72`). A hand-written client would have to re-type 61 paths and keep them in step by hand (ADR-006, `docs/DECISIONS.md:73`).

## Decision

- Runtime dependency `openapi-fetch`; dev dependency `openapi-typescript` (ADR-006, `docs/DECISIONS.md:67-78`).
- `openapi/riot-proxy.json` is the spec printed by `riot-proxy spec` from a release binary, without its trailing newline; it is byte-identical to production's `/openapi.json` (ADR-039, `docs/DECISIONS.md:536`; `README.md:51-66`).
- `just gen` writes `src/lib/api/schema.d.ts`; `just check` fails if it has drifted (`justfile:16-17,20-22`).
- Riot payloads that the spec types (account, summoner, league) use the generated types; match and timeline, which the spec leaves untyped, are parsed by hand in `src/lib/api/match.ts` (ADR-018, ADR-023).

## Consequences

- `src/lib/api/schema.d.ts` is never edited by hand (`CLAUDE.md:23`).
- A riot-proxy upgrade on the site's side is a spec refresh PR (#52, #58, #62, #66 in `git log`).
- `openapi-typescript` 7 declares a TypeScript 5 peer; TypeScript 6 is allowed in `pnpm-workspace.yaml:8-12`.

## Status

Accepted. The committed spec is riot-proxy 2.7.0 (`README.md:66`).

## Evidence

`src/lib/server/proxy.ts:136-153`, `justfile:16-22`, `src/lib/api/riot.ts:1-9`, `src/lib/api/match.ts:157-215`.

---

**Sources:** `docs/DECISIONS.md:L67-L78,L217-L225,L261-L281,L536`, `docs/IMPLEMENTATION.md:L72`, `README.md:L51-L66`, `justfile:L16-L22`, `pnpm-workspace.yaml:L8-L12`, `src/lib/server/proxy.ts:L136-L153`, `src/lib/api/riot.ts:L1-L9`
**Last verified:** 2026-11-03 against commit `2948c82`
