# ninjagoldfinch.lol documentation

How ninjagoldfinch.lol works, how it talks to riot-proxy, and how to run, deploy, operate and change it. Start with the reading path for your role below.

## What this service is

ninjagoldfinch.lol is the public website of a small, self-hosted League of Legends stats platform. It is a server-rendered SvelteKit app: every page is built on the server from riot-proxy's responses and sent as HTML, and it works without client JavaScript. riot-proxy is the only part of the platform that talks to the Riot API; this site is the only consumer that serves the public, and it holds one secret, a read-scope riot-proxy consumer key. Both run on one Onidel VPS in Sydney behind a Cloudflare Tunnel, and ninja-monitor watches them. The site has no database and writes to no object store. See [architecture/overview.md](./architecture/overview.md).

## Start here

**New developer.** [architecture/overview.md](./architecture/overview.md) → [workflows/development-setup.md](./workflows/development-setup.md) → [architecture/components.md](./architecture/components.md) → [architecture/request-lifecycle.md](./architecture/request-lifecycle.md) → [integration/contract.md](./integration/contract.md) → [workflows/adding-a-page.md](./workflows/adding-a-page.md) and [workflows/testing.md](./workflows/testing.md) → [CLAUDE.md](../CLAUDE.md) for the working rules.

**Operator deploying it.** [deployment/overview.md](./deployment/overview.md) → [deployment/install.md](./deployment/install.md) → [deployment/configuration.md](./deployment/configuration.md) → [deployment/upgrade-and-rollback.md](./deployment/upgrade-and-rollback.md) → [operations/runbook.md](./operations/runbook.md) and [operations/troubleshooting.md](./operations/troubleshooting.md).

**Consumer integrating with it.** The site has no JSON API for others. Its HTTP surface (pages, redirects, `/healthz`) is in [api/endpoints.md](./api/endpoints.md) and [api/openapi.yaml](./api/openapi.yaml); what it needs from riot-proxy is in [integration/contract.md](./integration/contract.md) and [integration/service-communication.md](./integration/service-communication.md).

## Contents

### Architecture

| File                                                                                             | Purpose                                                              |
| ------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------- |
| [architecture/overview.md](./architecture/overview.md)                                           | System context: the three services, Riot, the CDNs, the host, stores |
| [architecture/components.md](./architecture/components.md)                                       | Modules inside the site and their dependencies                       |
| [architecture/request-lifecycle.md](./architecture/request-lifecycle.md)                         | Profile, match and champion page requests, end to end                |
| [architecture/data-flow.md](./architecture/data-flow.md)                                         | From riot-proxy payload to HTML and the edge cache                   |
| [architecture/concurrency-and-rate-limiting.md](./architecture/concurrency-and-rate-limiting.md) | Parallel calls, deadlines, shared fetches, 429 and 503 handling      |
| [architecture/decisions/README.md](./architecture/decisions/README.md)                           | Eleven ADR digests with evidence; full log in `docs/DECISIONS.md`    |

### Integration (mirrors riot-proxy's side)

| File                                                                           | Purpose                                                        |
| ------------------------------------------------------------------------------ | -------------------------------------------------------------- |
| [integration/service-communication.md](./integration/service-communication.md) | Every interaction with other services                          |
| [integration/contract.md](./integration/contract.md)                           | What the site depends on from riot-proxy, and at which version |
| [integration/authentication.md](./integration/authentication.md)               | The consumer key, from issue to revocation; auth-off dev mode  |
| [integration/object-storage.md](./integration/object-storage.md)               | The site uses no bucket; riot-proxy's buckets in brief         |
| [integration/monitoring-hooks.md](./integration/monitoring-hooks.md)           | `/healthz`, log lines, ninja-monitor                           |
| [integration/environments.md](./integration/environments.md)                   | Production, local dev, test and the dormant LAN machines       |

### API

| File                                                                                       | Purpose                                            |
| ------------------------------------------------------------------------------------------ | -------------------------------------------------- |
| [api/openapi.yaml](./api/openapi.yaml)                                                     | OpenAPI 3.1 description of the site's routes       |
| [api/endpoints.md](./api/endpoints.md)                                                     | Route reference                                    |
| [api/errors.md](./api/errors.md)                                                           | Error states and how riot-proxy errors map to them |
| [api/pagination-filtering-and-versioning.md](./api/pagination-filtering-and-versioning.md) | Query parameters, canonical URLs, old URLs         |
| [api/examples.md](./api/examples.md)                                                       | curl walkthroughs                                  |

### Data

| File                                 | Purpose                                                  |
| ------------------------------------ | -------------------------------------------------------- |
| [data/models.md](./data/models.md)   | Page data models and how they map to riot-proxy and Riot |
| [data/caching.md](./data/caching.md) | Edge cache, in-memory holds, and riot-proxy's caches     |

Omitted: `data/schema.md` and `data/migrations.md`. The site has no database, tables or migrations.

### Workflows

| File                                                                                 | Purpose                                                                 |
| ------------------------------------------------------------------------------------ | ----------------------------------------------------------------------- |
| [workflows/development-setup.md](./workflows/development-setup.md)                   | Clean machine to tests and a local instance, with or without riot-proxy |
| [workflows/adding-a-page.md](./workflows/adding-a-page.md)                           | Files to touch for a new page, with `/champions` as the example         |
| [workflows/adding-a-proxy-call.md](./workflows/adding-a-proxy-call.md)               | Using a riot-proxy route the site does not call yet                     |
| [workflows/testing.md](./workflows/testing.md)                                       | Unit, e2e, fixtures, mock proxy, deadlines under garbage collection     |
| [workflows/release-process.md](./workflows/release-process.md)                       | Branch to production, by hand                                           |
| [workflows/code-style-and-conventions.md](./workflows/code-style-and-conventions.md) | Format, lint, naming, errors, logging, commits                          |

Not written: `workflows/ci.md` (there is no CI; `just check` is the gate and CLAUDE.md forbids adding CI) and `workflows/adding-a-migration.md` (no database). `adding-a-riot-call.md` is replaced by `adding-a-proxy-call.md`, because the site never calls Riot.

### Deployment

| File                                                                       | Purpose                                             |
| -------------------------------------------------------------------------- | --------------------------------------------------- |
| [deployment/overview.md](./deployment/overview.md)                         | The shared VPS, Tunnel, hostnames, who owns what    |
| [deployment/install.md](./deployment/install.md)                           | Fresh install on Ubuntu 26.04, with the real unit   |
| [deployment/configuration.md](./deployment/configuration.md)               | Every setting, secrets and production values        |
| [deployment/upgrade-and-rollback.md](./deployment/upgrade-and-rollback.md) | Deploying a commit and going back                   |
| [deployment/backup-and-restore.md](./deployment/backup-and-restore.md)     | What state exists and how it is recovered           |
| [deployment/capacity.md](./deployment/capacity.md)                         | The site's share of the VPS, measured and estimated |
| [deployment/security.md](./deployment/security.md)                         | Threat model in brief                               |
| [deployment/preview-vm.md](./deployment/preview-vm.md)                     | The dormant Proxmox preview VM                      |

### Operations

| File                                                             | Purpose                                              |
| ---------------------------------------------------------------- | ---------------------------------------------------- |
| [operations/runbook.md](./operations/runbook.md)                 | Service control, logs, keys, caches, outages, alerts |
| [operations/troubleshooting.md](./operations/troubleshooting.md) | 21 symptoms: cause, diagnosis, fix                   |
| [operations/observability.md](./operations/observability.md)     | Logs, request-id correlation, health; no metrics     |
| [operations/performance.md](./operations/performance.md)         | Hot paths, measured numbers, tuning constants        |

### Reference

| File                                                     | Purpose                         |
| -------------------------------------------------------- | ------------------------------- |
| [reference/glossary.md](./reference/glossary.md)         | Terms                           |
| [reference/dependencies.md](./reference/dependencies.md) | Libraries, versions and pinning |
| [reference/faq.md](./reference/faq.md)                   | Questions people ask            |

Not written: `reference/riot-api-usage.md` (the site never calls Riot; see riot-proxy's documentation).

### Meta

| File                                                    | Purpose                                                          |
| ------------------------------------------------------- | ---------------------------------------------------------------- |
| [\_meta/vocabulary.md](./_meta/vocabulary.md)           | Canonical names for services, environments, keys, buckets, terms |
| [\_meta/inventory.md](./_meta/inventory.md)             | Discovery facts with sources                                     |
| [\_meta/gaps.md](./_meta/gaps.md)                       | Every unverified point and how to resolve it                     |
| [\_meta/doc-maintenance.md](./_meta/doc-maintenance.md) | Which docs to touch for which code; checks; release checklist    |
| [\_meta/changelog.md](./_meta/changelog.md)             | Documentation changes                                            |
| [\_meta/progress.md](./_meta/progress.md)               | Per-document log of both passes                                  |
| [\_meta/handoff.md](./_meta/handoff.md)                 | Pass A to Pass B handoff                                         |

Scripts: `_meta/check-docs.py` (links, H1, footers, TODO coverage, Mermaid rendering) and `_meta/check-openapi-paths.py` (openapi.yaml paths against the routes).

Older project documents stay where they are: [IMPLEMENTATION.md](./IMPLEMENTATION.md) (the original plan, partly superseded), [DECISIONS.md](./DECISIONS.md) (ADR-001 to ADR-043) and [PROGRESS.md](./PROGRESS.md) (task ticks).

## Conventions in these docs

- **Names** come from [\_meta/vocabulary.md](./_meta/vocabulary.md).
- **Unknowns** are marked `> **TODO (unverified):** …` and collected in [\_meta/gaps.md](./_meta/gaps.md). Find them with `grep -rn "TODO (unverified)" docs/`.
- **Sources.** Each file ends with a **Sources** line of `file:line` ranges and a **Last verified** date and commit. riot-proxy paths are prefixed `riot-proxy:` and refer to its commit `48f32aa`. Paths under `build/` and `node_modules/` refer to generated or installed files at the stated commit, not tracked source.
- **Observed.** Behaviour marked "observed" was reproduced by running the code on the stated date; measurements say where they were taken.
- **Formatting.** CommonMark, one H1 per file, Mermaid in `mermaid` fences, relative links. `just check` runs Prettier over `docs/`, so run `pnpm prettier --write docs` after editing. Upkeep: [\_meta/doc-maintenance.md](./_meta/doc-maintenance.md).

---

**Sources:** `README.md:L1-L115`, `CLAUDE.md`, `docs/_meta/inventory.md`, the files listed above
**Last verified:** 2026-11-03 against commit `2948c82`
