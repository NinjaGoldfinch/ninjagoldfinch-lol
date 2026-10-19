# Documentation progress

One line per finished document: path, date, note, and any forward links to planned files.

## Pass A

- [x] docs/_meta/inventory.md — 2026-10-19 — discovery; riot-proxy boundary from `../riot-proxy` at `48f32aa`
- [x] docs/_meta/vocabulary.md — 2026-10-19 — canonical names
- [x] docs/architecture/overview.md — 2026-10-19 — system context; host facts from riot-proxy ADR-142 and the owner-supplied unit; links forward to data/caching.md and integration/environments.md (both Pass A)
- [x] docs/architecture/components.md — 2026-10-19 — layers, import graph, loaders; corrected the component count to 19 in inventory.md
- [x] docs/architecture/request-lifecycle.md — 2026-10-19 — profile, refresh, match and champion sequence diagrams
- [x] docs/architecture/data-flow.md — 2026-10-19 — end-to-end flow, transformations, copies; forward links to integration/object-storage.md, data/models.md, data/caching.md (Pass A)
- [x] docs/architecture/concurrency-and-rate-limiting.md — 2026-10-19 — parallel calls, shared fetches, deadlines state diagram, quotas
- [x] docs/architecture/decisions/ — 2026-10-19 — README index plus 11 digests (0001–0011); riot-proxy-owned decisions pointed to riot-proxy; fixed CLAUDE.md and justfile line citations in earlier docs
- [x] docs/integration/service-communication.md — 2026-10-19 — interaction map and per-interaction sequences; forward links to api/endpoints.md, contract.md, authentication.md, monitoring-hooks.md (Pass A)
- [x] docs/integration/contract.md — 2026-10-19 — verified against spec 2.7.0 (sha aafca901…) and riot-proxy 48f32aa; forward links to authentication.md, api/errors.md (Pass A)
- [x] docs/integration/authentication.md — 2026-10-19 — key model, storage, issue/rotate/revoke, auth-off dev mode; key name ninjagoldfinch-lol-prod per owner
- [x] docs/integration/object-storage.md — 2026-10-19 — site uses no bucket; riot-proxy topology, lifecycle, outage impact
- [x] docs/integration/monitoring-hooks.md — 2026-10-19 — /healthz, every log line, ninja-monitor checks from riot-proxy notes
- [x] docs/integration/environments.md — 2026-10-19 — production, local dev, test, dormant LAN proxy and preview VM; forward refs to Pass B files as plain paths
- [x] docs/api/openapi.yaml — 2026-10-19 — OpenAPI 3.1, Redocly lint valid (7 expected warnings: redirects without 2xx, static routes without 4xx); paths diffed both ways against src/routes and static/: no mismatches
- [x] docs/api/endpoints.md — 2026-10-19 — every route with params, responses, cache, riot-proxy calls; examples from probes
- [x] docs/api/errors.md — 2026-10-19 — three states, code mapping, own checks, partial failures
- [x] docs/api/pagination-filtering-and-versioning.md — 2026-10-19 — profile pages and filters, champion filters, canonical redirects, old URLs, spec pinning
- [x] docs/api/examples.md — 2026-10-19 — walkthroughs run against node build and the mock proxy; production section not run
- [x] docs/data/models.md — 2026-10-19 — ProfileData, MatchRow, MatchDetail, ChampionsPage, ChampionPage with field mappings and unit notes
- [x] docs/data/caching.md — 2026-10-19 — edge policies, in-memory lookups, riot-proxy caches; immutable asset header observed
- [x] docs/_meta/check-docs.py — 2026-10-19 — reusable checker (links, H1, footer, TODO coverage, Mermaid render)
- [x] docs/_meta/handoff.md — 2026-10-19 — Pass A handoff

### Pass A verification (2026-10-19)

- `python3 -I docs/_meta/check-docs.py .` with Mermaid rendering: see the Pass A report; all relative links resolve, all Mermaid blocks render.
- `npx -y @redocly/cli@2.64.1 lint docs/api/openapi.yaml`: valid, 7 warnings (redirect operations without 2xx, static routes without 4xx), accepted.
- openapi paths vs `src/routes` and `static/`: no mismatch in either direction.
- `grep -rn "TODO (unverified)" docs/`: every marker is listed in `gaps.md`.
- Footer spot-check (12 ranges re-opened): `deploy/proxmox/create-vm.sh:26-28`, `src/lib/server/champion-page.ts:93,146`, `riot-proxy:src/routes/statics.rs:161-167`, `riot-proxy:src/routes/players.rs:697,866`, `src/lib/domain/match-detail.ts:72` (wrong; fixed to 76), `riot-proxy:src/routes/players/refresh.rs:22-28`, `src/lib/server/patch.ts:79-83`, `.githooks/pre-commit:14-16`, `riot-proxy:docs/design/12-object-storage-and-hosting.md:617-619`, `riot-proxy:docs/DECISIONS.md:1512`.
- Earlier fixes found while writing: CLAUDE.md, justfile and Dockerfile line numbers in several docs; component count 19, not 21.

## Pass B

- [x] docs/workflows/development-setup.md — 2026-10-20 — executed: clean clone + `just setup` + `just check` (exit 0), dev against the mock (4 pages 200), riot-proxy v2.7.0 locally with auth off (placeholder Riot key); found the flaky `proxy.test.ts` timeout test; forward links to workflows/testing.md, workflows/release-process.md
- [x] docs/workflows/adding-a-page.md — 2026-10-20 — worked example is the real `/champions` page; forward links to workflows/testing.md, code-style-and-conventions.md, release-process.md, \_meta/doc-maintenance.md
- [x] docs/workflows/adding-a-proxy-call.md — 2026-10-20 — replaces adding-a-riot-call; spec refresh, typing, essential/optional, fixtures; forward link to workflows/testing.md
- [x] docs/workflows/testing.md — 2026-10-20 — ran `just e2e` (81 passed) and repeated unit runs; documented the flaky timeout test. Fixed Pass A: `package.json:45-47` → `50-52` in inventory.md and integration/object-storage.md
- [x] docs/workflows/release-process.md — 2026-10-20 — manual flow, hooks, phase tags; found that adapter-node deletes `build/` during a live-checkout build; forward links to workflows/code-style-and-conventions.md; plain-path refs to deployment/upgrade-and-rollback.md and deployment/preview-vm.md
- [x] docs/workflows/code-style-and-conventions.md — 2026-10-20 — Prettier, ESLint, naming, errors, logging (PUUIDs can appear in failed-call paths), commits; plain-path ref to reference/dependencies.md
- [x] docs/deployment/overview.md — 2026-10-20 — host, topology, hostnames, ownership table; added `ngf-mon-syd1` to vocabulary.md; forward links to deployment/install.md, capacity.md, preview-vm.md, upgrade-and-rollback.md, operations/runbook.md, operations/troubleshooting.md
- [x] docs/deployment/install.md — 2026-10-20 — real unit reproduced and passing `systemd-analyze verify`; build with ORIGIN, env-file start, missing-key refusal, cross-origin POST 403 all reproduced locally; not run on a fresh Ubuntu server; forward links to deployment/configuration.md, operations/troubleshooting.md
- [x] docs/deployment/configuration.md — 2026-10-20 — every setting; cross-checked with inventory section 7 by script (added `COREPACK_ENABLE_DOWNLOAD_PROMPT` to the inventory); `PUBLIC_SITE_NAME` confirmed build-time (`static: true`); forward link to deployment/preview-vm.md
- [x] docs/deployment/upgrade-and-rollback.md — 2026-10-20 — reflog-based rollback; spec-hash check run against riot-proxy v2.7.0 (matches); build 2.9 s measured locally; forward link to operations/troubleshooting.md
- [x] docs/deployment/backup-and-restore.md — 2026-10-20 — site has no data; env file and unit are the unbacked host state; riot-proxy backups summarised with sources
- [x] docs/deployment/capacity.md — 2026-10-20 — measured locally: RSS growth is V8 heap sizing (flat with a 96 MB cap), 177–234 req/s, page sizes, disk footprint; production numbers from ADR-039 and riot-proxy ADR-142
- [x] docs/deployment/security.md — 2026-10-20 — probed the production build: no PUUID in pages or `__data.json`, no security headers, cross-origin POST 403, bad match id 404; forward link to reference/dependencies.md
- [x] docs/workflows/development-setup.md (revised) — 2026-10-20 — command-line `PROXY_URL` reverted to `.env`'s once in a long session; now recommends `.env`; TODO added
- [x] docs/deployment/preview-vm.md — 2026-10-20 — dormant VM; ran `create-vm.sh --help`; README still defaults to the dormant LAN proxy
- [x] Pass A fix — 2026-10-20 — riot-proxy unreachable gives **500**, not 503 (observed on the production build): corrected docs/api/errors.md, docs/architecture/concurrency-and-rate-limiting.md (diagram and text, plus the hang TODO) and docs/api/openapi.yaml (`500` → new `Unreachable` response on the five data operations; Redocly still valid, 7 warnings)
- [x] docs/operations/runbook.md — 2026-10-20 — outage table from observed runs (refused 500, hung 503 at 5/30 s, bad key 503, bad Riot key 502→503); request-id cross-check against riot-proxy's log verified; forward link to operations/troubleshooting.md
- [x] docs/operations/troubleshooting.md — 2026-10-20 — 21 symptoms; 9 reproduced (env_invalid, refused 500, hung 503, never-finishing request, bad key 401, bad Riot key, ORIGIN 403, flaky test, LAN proxy ECONNREFUSED)
- [x] docs/operations/observability.md — 2026-10-20 — logs, request-id correlation (one-way; the site sends no id), `/healthz`, no metrics or tracing
- [x] docs/operations/performance.md — 2026-10-20 — per-page call graph, ADR-039 production numbers, local render timings, constants as knobs
- [x] docs/reference/glossary.md — 2026-10-20 — vocabulary domain terms expanded with code and doc links
- [x] docs/reference/dependencies.md — 2026-10-20 — installed versions read from node_modules; confirmed `openapi-fetch` is the only package the built server imports at runtime
- [x] docs/reference/faq.md — 2026-10-20 — answers link to the detailed pages
- [x] docs/_meta/doc-maintenance.md — 2026-10-20 — code-to-doc table, checks, release checklist, docs server note; added `_meta/check-openapi-paths.py` (exit 0)
- [x] docs/_meta/changelog.md — 2026-10-20 — Pass A and Pass B entries, with Pass A corrections
- [x] docs/_meta/gaps.md (finished) — 2026-10-20 — 28 gaps grouped High / Medium / Low; one row per marker
- [x] docs/README.md (finished) — 2026-10-20 — all "planned" markers removed; every file linked; omissions listed
- [x] Forward references — 2026-10-20 — plain paths to Pass B files replaced with links in integration/environments.md, workflows/code-style-and-conventions.md, workflows/release-process.md

### Pass B verification (2026-10-20)

- `python3 -I docs/_meta/check-docs.py .` with Mermaid rendering: 58 files, 20 Mermaid blocks, 0 problems. A separate anchor check over every `#fragment` link: 0 missing.
- `npx -y @redocly/cli@2.64.1 lint docs/api/openapi.yaml`: valid, 7 accepted warnings. `python3 -I docs/_meta/check-openapi-paths.py`: no mismatch either way.
- `grep -rn "TODO (unverified)" docs/`: 28 markers, 28 rows in `gaps.md`.
- development-setup.md and install.md re-executed as far as possible: clean clone, `just setup`, `just check`, `just e2e`, dev server on the mock and on a local riot-proxy v2.7.0, production build from an env file; not run on a fresh Ubuntu 26.04 server or with a real Riot key.
- Footer spot-check (12 re-opened): `src/lib/recent-storage.ts:6`, `docs/DECISIONS.md:560-562`, `src/routes/about/+page.ts:1-2`, `src/routes/summoner/[region]/[riotId]/+server.ts:9-13`, `tests/unit/fixtures-spec.test.ts:84-95`, `src/lib/domain/match-filters.ts:7`, `docs/DECISIONS.md:31-39`, `riot-proxy:deploy/riot-proxy-replica.timer:1-10`, `riot-proxy:src/telemetry.rs:101-121`, `src/lib/server/static-data.ts:42-51`, `riot-proxy:src/http/auth.rs:43-52`, `src/lib/domain/regions.ts:33`; all confirmed.
- Naming drift grep (`_meta/doc-maintenance.md` §Checks): only deliberate quotes of `ninjagoldfinch-web`.
- Every file in the README contents exists; omissions (`data/schema.md`, `data/migrations.md`, `workflows/ci.md`, `workflows/adding-a-migration.md`, `reference/riot-api-usage.md`) are stated there.
- `just check`: exit 0 (Prettier clean over `docs/`, 332 tests).
