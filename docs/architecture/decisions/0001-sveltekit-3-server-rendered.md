# 0001: A server-rendered SvelteKit 3 site that holds the proxy key

The site is a SvelteKit 3 app on adapter-node that renders every page on the server, because riot-proxy needs a bearer key the Browser must never see.

## Context

riot-proxy authenticates every caller with a consumer key (`Authorization: Bearer`), so a Browser calling it directly would expose the key (`docs/IMPLEMENTATION.md:51`). The plan asked for SvelteKit 2.x unless 3.x was stable; on 2026-10-09 `@sveltejs/kit` 3.0.1 was npm `latest` (`docs/DECISIONS.md:9`).

## Decision

- SvelteKit 3 with `@sveltejs/adapter-node`, Svelte 5 runes, Vite 8, TypeScript 6 (ADR-001, `docs/DECISIONS.md:5-19`).
- Data loads only in `+page.server.ts`; no client-side fetching of riot-proxy data and no remote functions (`CLAUDE.md:57-58`).
- Everything that reads the key lives in `src/lib/server/`, which SvelteKit refuses to bundle for the client (`CLAUDE.md:15-17`).
- Pages work without client JavaScript (`CLAUDE.md:59`).

## Consequences

- Imports use `#lib/...` with file extensions, kit config lives in `vite.config.ts`, and env vars are declared in `src/env.ts` (`docs/DECISIONS.md:13-17`).
- Node 22.18 or later is required (`package.json:7-9`).
- Interactive features that would need data in the Browser reuse a page's own load through `preloadData` rather than calling riot-proxy (ADR-030, `docs/DECISIONS.md:372`).

## Status

Accepted, in force.

## Evidence

`package.json:24-25,45-47`, `vite.config.ts:1-37`, `src/lib/server/proxy.ts:1-153`, ADR-001.

---

**Sources:** `docs/IMPLEMENTATION.md:L51`, `docs/DECISIONS.md:L5-L19,L372`, `CLAUDE.md:L15-L17,L57-L59`, `package.json:L7-L9,L24-L25,L45-L47`, `vite.config.ts:L1-L37`
**Last verified:** 2026-11-03 against commit `6d46c74`
