# Documentation changelog

Dated log of changes to the documentation set under `docs/` (not to the code; code history is in git and `docs/PROGRESS.md`). Newest first.

## 2026-10-20 — ninja-docs preparation

- Every **Last verified** footer now names `85d9cf8`, the squash merge of `e7c395c` on `main` (identical tree), so ninja-docs can judge footers against the served commit.
- Checked in a preview build of ninja-docs: 0 problems, 22 Mermaid diagrams rendered, every page loaded in headless Chromium.

## 2026-10-20 — Pass B

Added:

- `workflows/`: `development-setup.md`, `adding-a-page.md`, `adding-a-proxy-call.md`, `testing.md`, `release-process.md`, `code-style-and-conventions.md`.
- `deployment/`: `overview.md`, `install.md`, `configuration.md`, `upgrade-and-rollback.md`, `backup-and-restore.md`, `capacity.md`, `security.md`, `preview-vm.md`.
- `operations/`: `runbook.md`, `troubleshooting.md`, `observability.md`, `performance.md`.
- `reference/`: `glossary.md`, `dependencies.md`, `faq.md`.
- `_meta/`: `doc-maintenance.md`, `changelog.md`, `check-openapi-paths.py`.

Verified by running: a clean clone through `just setup` and `just check`; `just e2e` (81 passed); the dev server against the mock proxy and against a local riot-proxy v2.7.0 with auth off; the production build started from an env file as production does; failure modes (riot-proxy refused, hung, wrong consumer key, invalid Riot key, cross-origin POST); a load test for memory and latency.

Corrected in Pass A documents:

- An unreachable riot-proxy gives **HTTP 500**, not 503 (`api/errors.md`, `architecture/concurrency-and-rate-limiting.md`, `api/openapi.yaml`, which gained an `Unreachable` 500 response on the five data operations).
- `package.json:45-47` → `50-52` for the runtime dependency (`_meta/inventory.md`, `integration/object-storage.md`).
- Added `COREPACK_ENABLE_DOWNLOAD_PROMPT` to the inventory's configuration table, to match `deployment/configuration.md`.
- Added `ngf-mon-syd1` (monitoring host) to `vocabulary.md`.
- Forward references to Pass B files replaced with links (`README.md`, `integration/environments.md`).

New findings recorded as gaps: a flaky unit test and a page request that never finished against a hung riot-proxy (likely the same deadline problem); a dev server that once switched to `.env`'s `PROXY_URL`; adapter-node deleting `build/` during a live-checkout deploy.

## 2026-10-19 — Pass A

Added `README.md` (skeleton), `_meta/` (`inventory.md`, `vocabulary.md`, `progress.md`, `gaps.md`, `handoff.md`, `check-docs.py`), `architecture/` (overview, components, request lifecycle, data flow, concurrency and rate limiting, eleven ADR digests), `integration/` (service communication, contract, authentication, object storage, monitoring hooks, environments), `api/` (OpenAPI 3.1, endpoints, errors, pagination/filtering/versioning, examples) and `data/` (models, caching). `data/schema.md` and `data/migrations.md` omitted: the site has no store.

---

**Sources:** `docs/_meta/progress.md`, `docs/_meta/handoff.md`
**Last verified:** 2026-10-20 against commit `85d9cf8`
