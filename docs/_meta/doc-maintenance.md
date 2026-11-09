# Doc maintenance

How to keep `docs/` true as the code changes: which documents to touch for which code, the checks to run, and a checklist before a release. The docs will later be served by a small static docs server; everything here is plain CommonMark that MkDocs (Material) or Docusaurus can render.

## Which docs to touch

| When you change…                                                                        | Update                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| --------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A route under `src/routes/` (new, removed, renamed, redirect)                           | [api/openapi.yaml](../api/openapi.yaml), [api/endpoints.md](../api/endpoints.md), [inventory §4](./inventory.md#4-http-routes-master-list), [architecture/request-lifecycle.md](../architecture/request-lifecycle.md) if it is a main flow, [api/pagination-filtering-and-versioning.md](../api/pagination-filtering-and-versioning.md) for query parameters or old URLs                                                                                                                                                                           |
| A riot-proxy call (new, removed, optional ↔ essential)                                  | [integration/contract.md](../integration/contract.md), [integration/service-communication.md](../integration/service-communication.md), [inventory §5](./inventory.md#5-outbound-network-calls), [operations/performance.md](../operations/performance.md), [data/models.md](../data/models.md)                                                                                                                                                                                                                                                    |
| `src/lib/server/proxy.ts` (deadlines, headers, logging)                                 | [architecture/concurrency-and-rate-limiting.md](../architecture/concurrency-and-rate-limiting.md), [integration/monitoring-hooks.md](../integration/monitoring-hooks.md), [operations/observability.md](../operations/observability.md), [operations/troubleshooting.md](../operations/troubleshooting.md)                                                                                                                                                                                                                                         |
| `src/lib/server/errors.ts`, `src/hooks.server.ts`                                       | [api/errors.md](../api/errors.md), [api/openapi.yaml](../api/openapi.yaml) responses, [operations/troubleshooting.md](../operations/troubleshooting.md), [operations/runbook.md](../operations/runbook.md) outage table                                                                                                                                                                                                                                                                                                                            |
| `src/lib/server/cache.ts`, in-memory holds (`patch.ts`, `static-data.ts`, `cdragon.ts`) | [data/caching.md](../data/caching.md), [api/endpoints.md](../api/endpoints.md), [operations/performance.md](../operations/performance.md)                                                                                                                                                                                                                                                                                                                                                                                                          |
| An environment variable (`src/env.ts`, `src/lib/server/env.ts`, `vite.config.ts`)       | [deployment/configuration.md](../deployment/configuration.md) and [inventory §7](./inventory.md#7-configuration-surface) (they must list the same names), [deployment/install.md](../deployment/install.md), [workflows/development-setup.md](../workflows/development-setup.md), [integration/environments.md](../integration/environments.md)                                                                                                                                                                                                    |
| Any `console.error` / `console.warn` line                                               | The log table in [integration/monitoring-hooks.md](../integration/monitoring-hooks.md#logs), [operations/troubleshooting.md](../operations/troubleshooting.md)                                                                                                                                                                                                                                                                                                                                                                                     |
| `openapi/riot-proxy.json` (spec bump)                                                   | The "verified against" version in [integration/contract.md](../integration/contract.md), [reference/faq.md](../reference/faq.md), [workflows/development-setup.md](../workflows/development-setup.md) (release to download)                                                                                                                                                                                                                                                                                                                        |
| `package.json`, `pnpm-lock.yaml`, `.npmrc`, `pnpm-workspace.yaml`                       | [reference/dependencies.md](../reference/dependencies.md), [workflows/development-setup.md](../workflows/development-setup.md) tool versions, [inventory §1](./inventory.md#1-languages-runtimes-and-tooling)                                                                                                                                                                                                                                                                                                                                      |
| `justfile`, `.githooks/`, lint or format config                                         | [workflows/development-setup.md](../workflows/development-setup.md), [workflows/testing.md](../workflows/testing.md), [workflows/code-style-and-conventions.md](../workflows/code-style-and-conventions.md), [workflows/release-process.md](../workflows/release-process.md)                                                                                                                                                                                                                                                                       |
| `tests/mock-proxy/`, fixtures, `playwright.config.ts`                                   | [workflows/testing.md](../workflows/testing.md)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| `deploy/`                                                                               | [deployment/configuration.md](../deployment/configuration.md) (tooling table)                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| The production host (unit, env file, Tunnel, paths, host move)                          | [deployment/overview.md](../deployment/overview.md), [deployment/install.md](../deployment/install.md), [operations/runbook.md](../operations/runbook.md), [inventory §14](./inventory.md#14-owner-supplied-evidence-not-in-any-repo), [vocabulary.md](./vocabulary.md)                                                                                                                                                                                                                                                                            |
| An external monitor or probe (ninja-monitor, Healthchecks.io, the status bot) changes   | [integration/monitoring-hooks.md](../integration/monitoring-hooks.md), [operations/observability.md](../operations/observability.md), [operations/runbook.md](../operations/runbook.md), [deployment/overview.md](../deployment/overview.md), [integration/service-communication.md](../integration/service-communication.md), [architecture/overview.md](../architecture/overview.md), [inventory §14](./inventory.md#14-owner-supplied-evidence-not-in-any-repo), [vocabulary.md](./vocabulary.md), and the [gaps.md](./gaps.md) rows it narrows |
| A design decision (new ADR in `docs/DECISIONS.md`)                                      | A digest in [architecture/decisions/](../architecture/decisions/README.md) if it shapes the architecture                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| A new name for a service, environment, key or bucket                                    | [vocabulary.md](./vocabulary.md) first, then the documents                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |

After editing, refresh the footer: the **Sources** line lists the files and line ranges you re-read, and **Last verified** gets today's date and `git rev-parse --short HEAD`.

## Checks

Run from the repository root.

1. **Formatting.** `just check` runs `prettier --check .` over `docs/` too (`justfile:20`, `.prettierignore:12-13`):

   ```sh
   pnpm prettier --write docs
   ```

   Use `text` fences for literal output; Prettier reformats `json` fences.

2. **Links, H1, footers, TODO coverage and Mermaid:**

   ```sh
   python3 -I docs/_meta/check-docs.py .                 # every docs/**/*.md
   python3 -I docs/_meta/check-docs.py . docs/a/b.md     # one file
   SKIP_MERMAID=1 python3 -I docs/_meta/check-docs.py .  # without rendering
   ```

   It checks one H1 per file, a **Last verified** footer outside `_meta/`, that every relative link's file exists (it does not check `#anchors`), that every file with a `TODO (unverified)` marker appears in `gaps.md`, and renders every Mermaid block with `npx -y @mermaid-js/mermaid-cli`. It skips `docs/IMPLEMENTATION.md`, `docs/DECISIONS.md`, `docs/PROGRESS.md` and `docs/notes/` (`docs/_meta/check-docs.py:19-21`).

   If Puppeteer's own Chromium cannot start (missing system libraries), point it at Playwright's headless shell:

   ```sh
   exe=$(ls -d ~/.cache/ms-playwright/chromium_headless_shell-*/chrome-headless-shell-linux64/chrome-headless-shell | head -1)
   echo "{\"executablePath\":\"$exe\",\"args\":[\"--no-sandbox\"],\"headless\":\"shell\"}" > /tmp/pp.json
   MERMAID_PUPPETEER_CONFIG=/tmp/pp.json python3 -I docs/_meta/check-docs.py .
   ```

3. **OpenAPI.** `docs/api/openapi.yaml` is written by hand from the route code; SvelteKit does not generate one. After a route change:

   ```sh
   npx -y @redocly/cli@2.64.1 lint docs/api/openapi.yaml   # valid; 7 known warnings
   python3 -I docs/_meta/check-openapi-paths.py            # paths vs src/routes and static/, both ways
   ```

   The 7 warnings are operations without a 2xx response (redirect-only routes) and static routes without a 4xx; they are accepted.

4. **Gaps.** Every marker must be listed in `gaps.md`:

   ```sh
   grep -rn "TODO (unverified)" docs/ --include=*.md | grep -v '_meta/gaps.md'
   ```

5. **Naming drift.** Grep for variants of names in [vocabulary.md](./vocabulary.md), for example:

   ```sh
   grep -rn -E 'Riot ?Proxy|riot proxy|riotproxy|Ninja-?Monitor|ninja monitor|ninjamonitor|ngf-prod([^-]|$)|ninjagoldfinch-web' docs/ --include=*.md
   ```

   Hits for `ninjagoldfinch-web` are expected only where a document quotes the older repo docs or the preview VM name.

## Before a release

- [ ] Every code change in the release has its row from [Which docs to touch](#which-docs-to-touch) done.
- [ ] `pnpm prettier --write docs` and `just check` pass.
- [ ] `check-docs.py` reports 0 problems with Mermaid rendering on.
- [ ] Redocly lint is valid and `check-openapi-paths.py` exits 0.
- [ ] New `TODO (unverified)` markers are in `gaps.md`; resolved ones are removed from both.
- [ ] [changelog.md](./changelog.md) has a dated entry.
- [ ] `docs/README.md` lists every new file.

## The docs web server (planned)

The docs are meant to be served by a small static docs server on a development machine; none exists yet. The files are written for it: ATX headings, one H1 per file, relative links, Mermaid in `mermaid` fences, no HTML, including inside Mermaid labels. A minimal MkDocs (Material) setup would have its `nav` mirror the contents tables in [docs/README.md](../README.md) and enable Material's Mermaid support through `pymdownx.superfences`. `docs/IMPLEMENTATION.md`, `DECISIONS.md`, `PROGRESS.md` and `docs/notes/` are older project documents that can be served as they are.

---

**Sources:** `docs/_meta/check-docs.py:L1-L53`, `docs/_meta/check-openapi-paths.py`, `justfile:L19-L28`, `.prettierignore:L11-L13`, `docs/README.md`
**Last verified:** 2026-10-20 against commit `85d9cf8`
