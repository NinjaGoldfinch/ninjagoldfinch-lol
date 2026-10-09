# ninjagoldfinch.lol

A server-rendered League of Legends stats site. It is a SvelteKit app that sits in front of [riot-proxy](https://github.com/NinjaGoldfinch/riot-proxy): riot-proxy is the only thing that talks to Riot, and this site is the only thing that talks to riot-proxy.

- Plan, conventions and task list: [docs/IMPLEMENTATION.md](docs/IMPLEMENTATION.md)
- Working rules: [CLAUDE.md](CLAUDE.md)
- Decisions: [docs/DECISIONS.md](docs/DECISIONS.md)
- Progress: [docs/PROGRESS.md](docs/PROGRESS.md)

## Requirements

- Node 22.17 or later
- pnpm (version pinned in `package.json`; `corepack enable` provides it)
- [just](https://github.com/casey/just)
- A riot-proxy to talk to (see below)
- For `just e2e` only: Playwright's Chromium and its system packages, once per machine:
  `pnpm exec playwright install chromium` and `sudo "$(command -v pnpm)" exec playwright install-deps chromium`. The system packages include fonts; without them Chromium lays out text at zero height and visibility checks fail.

## Getting started

```sh
just setup   # install dependencies, enable git hooks, create .env from .env.example
just dev     # dev server
```

`just setup` copies `.env.example` to `.env` if `.env` does not exist. `.env` is never committed.

## Commands

| Command      | Does                                                                |
| ------------ | ------------------------------------------------------------------- |
| `just setup` | Install dependencies, enable git hooks, create `.env`               |
| `just dev`   | Dev server with hot reload                                          |
| `just gen`   | Regenerate `src/lib/api/schema.d.ts` from `openapi/riot-proxy.json` |
| `just check` | Format check, lint, svelte-check, unit tests, build. The only gate. |
| `just e2e`   | Playwright smoke tests against the mock proxy                       |
| `just image` | Build the production Docker image                                   |

There is no CI. The pre-push hook runs `just check`, and the pre-commit hook refuses commits on `main` and staged content that looks like a riot-proxy or Riot API key.

## riot-proxy

| Variable    | Meaning                                                                                |
| ----------- | -------------------------------------------------------------------------------------- |
| `PROXY_URL` | Base URL of riot-proxy. Defaults to the LAN dev instance, `http://192.168.68.46:8080`. |
| `PROXY_KEY` | Read-scope consumer key. Optional in development, required in production.              |

The dev instance runs with auth disabled, so no key is needed locally. Production riot-proxy refuses to start with auth disabled, so the production site must have `PROXY_KEY` set.

### OpenAPI spec

riot-proxy serves its OpenAPI document as raw JSON at **`/openapi.json`**. It is the same document the `/docs` reference page embeds. For the dev instance that is:

```text
http://192.168.68.46:8080/openapi.json
```

A copy is committed at `openapi/riot-proxy.json` so that a proxy change shows up as a diff. To refresh it, then regenerate the types:

```sh
curl -fsS http://192.168.68.46:8080/openapi.json -o openapi/riot-proxy.json
just gen
```

The committed copy is riot-proxy `2.0.0-rc.3` as served by the dev instance on 2026-10-09 (`main`, with the site's requested changes). It is excluded from Prettier so it stays byte-identical to what the proxy serves. `just check` fails if `src/lib/api/schema.d.ts` no longer matches it.

## Tests and fixtures

Unit tests (`tests/unit/`) run in `just check`. Browser tests (`tests/e2e/`) run with `just e2e`. Playwright starts the real production server (`node build`) pointed at a mock riot-proxy (`tests/mock-proxy/`), which replays the recorded responses in `tests/fixtures/`. A request with no recorded response gets a 500, so it fails loudly. Nothing reaches the real proxy or Riot.

To record a new fixture from `PROXY_URL` (one live call, so it spends Riot rate limit):

```sh
just fixture account-hide-on-bush '/v1/riot/accounts/by-riot-id/asia/Hide%20on%20bush/KR1'
```

Failure states that can't be recorded on demand use hand-written `tests/fixtures/synthetic-*.json` files, each with a `_note` saying so (ADR-017).

Use the path exactly as the client sends it, URL-encoded. The recorder keeps only the headers the site reads, and replaces every `puuid` with a stable placeholder. For Data Dragon files, add `--keep id,id,…` to keep only the entries the other fixtures use, for example `just fixture static-item '/v1/static/item?version=16.20.1' --keep 1001,1056`.

## Deploying

The site runs as one Docker container built from the `Dockerfile`, with `deploy/compose.yaml`. To run it on a VM on your Proxmox node, see [deploy/proxmox/README.md](deploy/proxmox/README.md).
