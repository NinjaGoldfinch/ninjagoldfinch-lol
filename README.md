# ninjagoldfinch.lol

A server-rendered League of Legends stats site. It is a SvelteKit app that sits in front of [riot-proxy](https://github.com/NinjaGoldfinch/riot-proxy): riot-proxy is the only thing that talks to Riot, and this site is the only thing that talks to riot-proxy.

- Plan, conventions and task list: [docs/IMPLEMENTATION.md](docs/IMPLEMENTATION.md)
- Working rules: [CLAUDE.md](CLAUDE.md)
- Decisions: [docs/DECISIONS.md](docs/DECISIONS.md)
- Progress: [docs/PROGRESS.md](docs/PROGRESS.md)

## Requirements

- Node 22.18 or later (`engines` in `package.json`)
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

| Command        | Does                                                                                                                                                                                                                                                             |
| -------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `just setup`   | Install dependencies, enable git hooks, create `.env`                                                                                                                                                                                                            |
| `just dev`     | Dev server with hot reload                                                                                                                                                                                                                                       |
| `just gen`     | Regenerate `src/lib/api/schema.d.ts` from `openapi/riot-proxy.json`                                                                                                                                                                                              |
| `just check`   | The only gate: Prettier check, spec drift check (`schema.d.ts` against the spec), ESLint, `svelte-kit sync`, svelte-check, Vitest unit tests, build, the deploy script test (`deploy/proxmox/test.sh`), and the release package test (`scripts/package.test.sh`) |
| `just e2e`     | Playwright smoke tests against the mock proxy                                                                                                                                                                                                                    |
| `just fixture` | Record one riot-proxy response as a test fixture (spends Riot rate limit)                                                                                                                                                                                        |
| `just image`   | Build the Docker image (for the dormant preview VM; production runs without Docker)                                                                                                                                                                              |

CI runs the same gate as `just check` (`scripts/check.sh`) on every pull request and on `main` (`.github/workflows/ci.yml`, ADR-050). The pre-push hook runs `just check` too, and the pre-commit hook refuses commits on `main` and staged content that looks like a riot-proxy or Riot API key.

## riot-proxy

| Variable      | Meaning                                                                                                                                |
| ------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| `PROXY_URL`   | Base URL of riot-proxy. Required, with no default: there is no shared dev instance.                                                    |
| `PROXY_KEY`   | Read-scope consumer key. Optional in development, required in production.                                                              |
| `CDRAGON_URL` | Base URL of CommunityDragon, for stat shard names. Optional; defaults to `https://raw.communitydragon.org`, and a mirror can stand in. |

A riot-proxy run locally with auth disabled needs no key. Tests and `just e2e` use the mock proxy and need no riot-proxy at all. Production riot-proxy refuses to start with auth disabled, so the production site must have `PROXY_KEY` set.

### OpenAPI spec

riot-proxy serves its OpenAPI document as raw JSON at **`/openapi.json`**, the same document the `/docs` reference page embeds. Its release binary prints the same document with `riot-proxy spec`, which needs no config, key or server.

A copy is committed at `openapi/riot-proxy.json` so that a proxy change shows up as a diff. To refresh it from a release, then regenerate the types:

```sh
repo=$PWD; v=2.7.0; cd "$(mktemp -d)"
curl -fsSLO https://github.com/NinjaGoldfinch/riot-proxy/releases/download/v$v/riot-proxy-linux-amd64
curl -fsSLO https://github.com/NinjaGoldfinch/riot-proxy/releases/download/v$v/sha256sums
sha256sum --ignore-missing -c sha256sums && chmod +x riot-proxy-linux-amd64
./riot-proxy-linux-amd64 spec | head -c -1 > "$repo/openapi/riot-proxy.json"   # served without a trailing newline
cd "$repo" && just gen
```

The committed copy is riot-proxy `2.7.0` from the release binary, sha256 `aafca901…088b8`. Production's `/openapi.json` has the same sha256 (checked on 2026-10-19). It is excluded from Prettier so it stays that way. `just check` fails if `src/lib/api/schema.d.ts` no longer matches it.

## Tests and fixtures

Unit tests (`tests/unit/`) run in `just check`. Browser tests (`tests/e2e/`) run with `just e2e`. Playwright starts the real production server (`node build`) pointed at a mock riot-proxy (`tests/mock-proxy/`), which replays the recorded responses in `tests/fixtures/`. A request with no recorded response gets a 500, so it fails loudly. Nothing reaches the real proxy or Riot.

To record a new fixture from `PROXY_URL` (one live call, so it spends Riot rate limit). This needs a riot-proxy you can reach; there is no shared dev instance, so without one write a synthetic fixture instead:

```sh
just fixture profile-hide-on-bush '/v1/players/by-riot-id/Hide%20on%20bush/KR1/profile'
```

Failure states that can't be recorded on demand use hand-written `tests/fixtures/synthetic-*.json` files, each with a `_note` saying so (ADR-017).

Use the path exactly as the client sends it, URL-encoded. The recorder keeps only the headers the site reads, and replaces Riot's player ids (every `puuid` and `summonerId`, and a match's `metadata.participants`) with stable placeholders. For Data Dragon files, add `--keep id,id,…` to keep only the entries the other fixtures use, for example `just fixture static-item '/v1/static/item?version=16.20.1' --keep 1001,1056`. For a list, `--keep` keeps the entries with those `id`s.

A full URL records from CommunityDragon instead. The fixture is keyed by the URL's path, and the mock serves it when `CDRAGON_URL` points at the mock, as the e2e tests do: `just fixture cdragon-perks 'https://raw.communitydragon.org/16.20/plugins/rcp-be-lol-game-data/global/default/v1/perks.json' --keep 5001,5008`.

## Version and status

| Endpoint           | Access | Answers                                                                     |
| ------------------ | ------ | --------------------------------------------------------------------------- |
| `GET /healthz`     | public | `{"ok":true,"version":"1.0.4"}` while the process is up; deploys wait on it |
| `GET /api/version` | public | `{"version":"1.0.4","commit":"a1b2c3d"}`, never cached                      |

`/api/version` lets a poller see a deploy: the version changes when a new release starts. `scripts/package.sh` bakes the release's version and short commit into the build (`BUILD_VERSION`, `BUILD_COMMIT`), and the server logs them with the build time at start-up. Any other build, such as `just dev` or a plain `pnpm build`, reports `dev` for both (ADR-061).

```console
$ curl -s https://ninjagoldfinch.lol/api/version
{"version":"1.0.4","commit":"a1b2c3d"}
```

## Deploying

### Preview VM (dormant)

The LAN preview ran as one Docker container built from the `Dockerfile`, with `deploy/compose.yaml`. The VM (VM 104) no longer exists (owner, 2026-10-19). The scripts are kept, and `just check` still tests them, in case it is made again: see [deploy/proxmox/README.md](deploy/proxmox/README.md) and [docs/deployment/preview-vm.md](docs/deployment/preview-vm.md).

### Production

Production runs without Docker: `node build` under systemd on the same server as riot-proxy, reached through a Cloudflare Tunnel at `https://ninjagoldfinch.lol`.

From `v1.0.0` it runs a release from `/srv/ninjagoldfinch-lol/current`, deployed with `.github/workflows/deploy.yml` after the owner's approval (ADR-051 to ADR-054). The move from the checkout, and deploying and rolling back releases, are in [docs/deployment/releases.md](docs/deployment/releases.md). The checkout below is how production ran before, and the fallback until the move has settled.

| What       | Where                                                                                  |
| ---------- | -------------------------------------------------------------------------------------- |
| Checkout   | `/opt/ninjagoldfinch-lol`, pulled with a read-only deploy key                          |
| Service    | `ninjagoldfinch-lol.service`, running as the `ninjagoldfinch-lol` user                 |
| Settings   | `/etc/ninjagoldfinch-lol/env`: `NODE_ENV`, `HOST`, `PORT`, `PROXY_URL` and `PROXY_KEY` |
| Listens on | `127.0.0.1:3000`; the tunnel is the only way in                                        |
| Logs       | `sudo journalctl -u ninjagoldfinch-lol`                                                |
| Liveness   | `curl -s http://127.0.0.1:3000/healthz`                                                |

To deploy the latest `main`, run on the server:

```sh
cd /opt/ninjagoldfinch-lol
sudo -H -u ninjagoldfinch-lol git pull
sudo -H -u ninjagoldfinch-lol pnpm install --frozen-lockfile
sudo -H -u ninjagoldfinch-lol env ORIGIN=https://ninjagoldfinch.lol pnpm build
sudo systemctl restart ninjagoldfinch-lol
```

`ORIGIN` goes on the build command because the site's origin is fixed at build time (ADR-014); it is not read from the settings file. Form posts, such as Refresh, are accepted only from that origin.

## License

Licensed under the [MIT License](LICENSE).
