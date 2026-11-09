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

| Command        | Does                                                                                                                                                                                                                                                                                    |
| -------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `just setup`   | Install dependencies, enable git hooks, create `.env`                                                                                                                                                                                                                                   |
| `just dev`     | Dev server with hot reload                                                                                                                                                                                                                                                              |
| `just gen`     | Regenerate `src/lib/api/schema.d.ts` from `openapi/riot-proxy.json`                                                                                                                                                                                                                     |
| `just check`   | The only gate: Prettier check, the `docs/PROGRESS.md` tick check (`scripts/check-progress.ts`, ADR-069), spec drift check (`schema.d.ts` against the spec), ESLint, `svelte-kit sync`, svelte-check, Vitest unit tests, build, and the release package test (`scripts/package.test.sh`) |
| `just e2e`     | Playwright smoke tests against the mock proxy                                                                                                                                                                                                                                           |
| `just fixture` | Record one riot-proxy response as a test fixture (spends Riot rate limit)                                                                                                                                                                                                               |

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

| Endpoint           | Access                           | Answers                                                                     |
| ------------------ | -------------------------------- | --------------------------------------------------------------------------- |
| `GET /healthz`     | public                           | `{"ok":true,"version":"1.0.4"}` while the process is up; deploys wait on it |
| `GET /api/version` | public                           | `{"version":"1.0.4","commit":"a1b2c3d"}`, never cached                      |
| `GET /api/status`  | bearer token, or a local request | the shared status contract, below; `401` otherwise                          |

`/api/version` lets a poller see a deploy: the version changes when a new release starts. `scripts/package.sh` bakes the release's version and short commit into the build (`BUILD_VERSION`, `BUILD_COMMIT`), and the server logs them with the build time at start-up. Any other build, such as `just dev` or a plain `pnpm build`, reports `dev` for both (ADR-061).

```console
$ curl -s https://ninjagoldfinch.lol/api/version
{"version":"1.0.4","commit":"a1b2c3d"}
```

`/api/status` follows the status contract every ninjagoldfinch service shares, for the frontend only: riot-proxy reports its own crawler, database and storage (ADR-062). It reads held results and in-memory counters only, so it answers in a few milliseconds and never calls riot-proxy. The checks run in the background, at start-up and then every `STATUS_CHECK_INTERVAL_S`:

| Check         | `ok`                                                               | otherwise                                                                                                     |
| ------------- | ------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------- |
| `riot_proxy`  | riot-proxy's `/readyz` answers 200 with the site's key, within 5 s | `down`: unreachable, not ready (the detail names `sqlite` or `limiter`), the key refused, or any other status |
| `static_data` | a patch and its lookups are loaded                                 | `degraded`: none yet, so each page waits on riot-proxy for them                                               |

`status` is the worst check. Counters run from `started_at`:

| Metric                                         | Kind    | Counts                                                                     |
| ---------------------------------------------- | ------- | -------------------------------------------------------------------------- |
| `http_requests_total`, `http_errors_total`     | counter | every request the server answered, and those that were 5xx                 |
| `api_requests_total`                           | counter | requests to `/api/…`                                                       |
| `proxy_requests_total`, `proxy_errors_total`   | counter | the pages' riot-proxy calls, and those with no answer, a 429 or a 5xx      |
| `proxy_latency_ms_p50`, `proxy_latency_ms_p95` | gauge   | those calls' times over the last 5 minutes; 0 with none                    |
| `patch_age_s`                                  | gauge   | seconds since the current patch was loaded or last refreshed; 0 before one |

Access: a request with `Authorization: Bearer <STATUS_TOKEN>`, or one made on the host itself or from `STATUS_ALLOW_CIDR`, without the token. Production is reached only through `cloudflared` on loopback, so a request carrying Cloudflare's `Cf-Connecting-Ip` always needs the token, whatever its address. Anything else is `401`.

| Setting                   | Default | Meaning                                                            |
| ------------------------- | ------- | ------------------------------------------------------------------ |
| `STATUS_TOKEN`            | unset   | bearer token, at least 16 characters; secret, in the env file only |
| `STATUS_ALLOW_CIDR`       | empty   | comma-separated CIDRs besides loopback that need no token          |
| `STATUS_CHECK_INTERVAL_S` | `30`    | seconds between checks, 5–3600                                     |

```console
$ curl -s -H "Authorization: Bearer $STATUS_TOKEN" https://ninjagoldfinch.lol/api/status
{
  "schema": 1,
  "service": "ninjagoldfinch-lol",
  "host": "ngf-prod-syd1",
  "version": "1.0.5",
  "commit": "a1b2c3d",
  "built_at": "2026-11-05T09:12:00Z",
  "started_at": "2026-11-05T10:00:00Z",
  "uptime_s": 86400,
  "status": "ok",
  "checks": [
    { "name": "riot_proxy", "status": "ok", "latency_ms": 3, "checked_at": "2026-11-06T09:59:41Z", "detail": "ready" },
    { "name": "static_data", "status": "ok", "latency_ms": 0, "checked_at": "2026-11-06T09:59:41Z", "detail": "patch 16.21.1" }
  ],
  "metrics": {
    "http_requests_total": 48211,
    "http_errors_total": 12,
    "api_requests_total": 2880,
    "proxy_requests_total": 61034,
    "proxy_errors_total": 9,
    "proxy_latency_ms_p50": 4,
    "proxy_latency_ms_p95": 180,
    "patch_age_s": 212
  }
}
```

When `EVENTS_URL` is set, changes of state are POSTed there as the contract's event, never once per check (ADR-063):

| Event               | Severity | Sent when                                                                                  | `detail`                     |
| ------------------- | -------- | ------------------------------------------------------------------------------------------ | ---------------------------- |
| `proxy_unreachable` | critical | `riot_proxy` has been `down` for 3 checks in a row                                         | `reason`: the check's detail |
| `proxy_recovered`   | info     | the first `riot_proxy` `ok` after a `proxy_unreachable`, also across a restart of the site | `reason`                     |
| `deployed`          | info     | the server starts with another release than the last start, recorded in `STATE_DIRECTORY`  | `from`, `to`: versions       |

One worker sends them in order, 5 s per attempt, retrying after 1, 2, 4 and 8 s and dropping an event after 5 attempts; at most 64 wait, and a full queue drops the newest with a warning. A redirect is not followed and counts as a failed attempt, so `EVENTS_URL` must be the receiver's final URL. A username or password in it is refused at start-up; a receiver's token goes in the path or the query string. A dropped event is not sent again. Sending never holds up a page or `/api/status`.

```json
{
	"schema": 1,
	"service": "ninjagoldfinch-lol",
	"host": "ngf-prod-syd1",
	"event": "deployed",
	"severity": "info",
	"at": "2026-11-05T10:00:00Z",
	"detail": { "from": "1.1.0", "to": "1.2.0" }
}
```

| Setting           | Default | Meaning                                                                                                                                                                                                                  |
| ----------------- | ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `EVENTS_URL`      | unset   | where events are POSTed; unset sends none                                                                                                                                                                                |
| `STATE_DIRECTORY` | unset   | writable directory for the last start's version and, when `EVENTS_URL` is set, the raised proxy alarm (ADR-064); systemd sets it from `StateDirectory=`. Unset, no `deployed`, and the alarm is not kept across restarts |

## Deploying

### Production

Production runs without Docker (ADR-038; the Docker preview VM was removed in ADR-067): `node build` under systemd on the same server as riot-proxy, reached through a Cloudflare Tunnel at `https://ninjagoldfinch.lol`.

From `v1.0.0` it runs a release from `/srv/ninjagoldfinch-lol/current`, deployed with `.github/workflows/deploy.yml` after the owner's approval (ADR-051 to ADR-054). The move from the checkout, and deploying and rolling back releases, are in [docs/deployment/releases.md](docs/deployment/releases.md). The checkout below is how production ran before, and the fallback until the move has settled.

| What       | Where                                                                                                  |
| ---------- | ------------------------------------------------------------------------------------------------------ |
| Checkout   | `/opt/ninjagoldfinch-lol`, pulled with a read-only deploy key                                          |
| Service    | `ninjagoldfinch-lol.service`, running as the `ninjagoldfinch-lol` user                                 |
| Settings   | `/etc/ninjagoldfinch-lol/env`: `NODE_ENV`, `HOST`, `PORT`, `PROXY_URL`, `PROXY_KEY` and `STATUS_TOKEN` |
| Listens on | `127.0.0.1:3000`; the tunnel is the only way in                                                        |
| Logs       | `sudo journalctl -u ninjagoldfinch-lol`                                                                |
| Liveness   | `curl -s http://127.0.0.1:3000/healthz`                                                                |

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
