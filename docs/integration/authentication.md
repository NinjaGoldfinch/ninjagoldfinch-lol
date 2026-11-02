# Authentication

How ninjagoldfinch.lol authenticates to riot-proxy with its consumer key: issue, storage, use, rotation, revocation and limits. Also covers the auth-off mode used for local development.

## The model

riot-proxy issues one consumer key per client. The site holds exactly one, named `ninjagoldfinch-lol-prod` in production, with the `read` scope. It never holds the Riot API key or an admin key (`docs/IMPLEMENTATION.md:201`). The Browser never sees the key: only code under `src/lib/server/` reads it (`CLAUDE.md:15-17`).

| Property             | Value                                                                             | Source                                                                                     |
| -------------------- | --------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| Format               | `rpx_` followed by base64url of 24 random bytes                                   | `riot-proxy:src/consumers.rs:12,95-103`                                                    |
| Sent as              | `Authorization: Bearer <key>`                                                     | `src/lib/server/proxy.ts:146`                                                              |
| Stored by riot-proxy | SHA-256 hash only, in SQLite table `consumers`                                    | `riot-proxy:src/consumers.rs:105-107`, `riot-proxy:src/db/migrations/V0001__init.sql:5-13` |
| Scopes               | `read` (all `/v1/players`, `/v1/riot`, `/v1/lol`, `/v1/static` routes) or `admin` | `riot-proxy:src/consumers.rs:18-36`, `riot-proxy:src/routes/docs.rs:118-126`               |
| Quota                | `quota_per_min`, default 600, sliding 60 s window                                 | `riot-proxy:src/consumers.rs:14`, `riot-proxy:src/http/quota.rs:1-8`                       |
| Lookup cache         | riot-proxy caches a key lookup for 60 s, an unknown key for 30 s                  | `riot-proxy:src/http/auth.rs:29-32`                                                        |

riot-proxy also accepts `?token=` when no `Authorization` header is present, but documents it for WebSocket handshakes only (`riot-proxy:src/http/auth.rs:141-156`, `riot-proxy:src/routes/docs.rs:104-112`). The site never uses it.

## On the site

`PROXY_KEY` is declared in `src/env.ts:27-30` and validated by `parseProxyKey` (`src/lib/server/env.ts:42-55`):

- Required when `NODE_ENV=production`: the server refuses to start without it. An empty or whitespace-only value counts as unset.
- Optional otherwise, for a riot-proxy running with auth disabled.
- Validation is skipped during `vite build`, so building needs no key (`src/env.ts:5-10`, ADR-004).

When the key is unset the client sends no `Authorization` header at all (`src/lib/server/proxy.ts:136-147`).

Where the value lives:

| Environment | Location                                                                                             |
| ----------- | ---------------------------------------------------------------------------------------------------- |
| production  | `/etc/ninjagoldfinch-lol/env`, read by systemd (`EnvironmentFile=`); created root-only (`umask 077`) | owner-supplied unit; `riot-proxy:docs/design/12-object-storage-and-hosting.md:626-627` |
| local dev   | `.env` in the checkout, never committed (`.gitignore:15-18`)                                         |
| test        | `PROXY_KEY=e2e-placeholder`; the mock proxy ignores it (`playwright.config.ts:26`)                   |

Guard rails against leaking it:

- `.githooks/pre-commit` refuses staged lines matching `(rpx_|RGAPI-)[A-Za-z0-9_-]` (ADR-002).
- `PUBLIC_` variables reach the Browser; the only one is `PUBLIC_SITE_NAME` (`src/env.ts:17-22`, `CLAUDE.md:17`).
- The fixture recorder sends the key to riot-proxy only, never to CommunityDragon (`tests/record-fixture.ts:105-108`), and fixtures are redacted.
- `.dockerignore` keeps `.env` files out of the image build context (`.dockerignore:4-6`).

## Issue a key

On the riot-proxy host, with riot-proxy's own configuration (its `DATA_DIR` must point at the live database):

```sh
riot-proxy key create --name ninjagoldfinch-lol-prod      # --scopes read is the default, --quota 600 the default
```

The plaintext key is printed once and never stored (`riot-proxy:src/cli/key.rs:10-57`). Put it in `/etc/ninjagoldfinch-lol/env` as `PROXY_KEY=…` and restart the site. The plan asks for a separate key for local development, so either can be revoked alone (`docs/IMPLEMENTATION.md:194`).

> **TODO (unverified):** the exact command line for running `riot-proxy key …` on `ngf-prod-syd1` (user, environment file and binary path). riot-proxy's README shows `./riot-proxy key create` (`riot-proxy:README.md:70-72`); its systemd template uses `/usr/local/bin/riot-proxy` with `EnvironmentFile=/etc/riot-proxy/env` (`riot-proxy:docs/design/07-deployment.md:75-93`), but the production unit is not in its repo.

Keys can also be created over riot-proxy's admin API, `POST /v1/admin/consumers` with an admin key, reachable on `admin.ninjagoldfinch.lol` behind Cloudflare Access (`riot-proxy:src/routes/admin.rs:173-222`, `riot-proxy:docs/design/13-admin-dashboard.md:61-65`).

## Rotate a key

riot-proxy has no rotate command; rotation is create, switch, revoke (`riot-proxy:docs/CUTOVER.md:108`):

1. `riot-proxy key create --name <new-name>` and keep the printed key. Names are unique, so the new key needs a new name.
2. Replace `PROXY_KEY` in `/etc/ninjagoldfinch-lol/env`.
3. `sudo systemctl restart ninjagoldfinch-lol`.
4. Load a profile page and check `journalctl -u ninjagoldfinch-lol` shows no `proxy 401`.
5. `riot-proxy key revoke ninjagoldfinch-lol-prod`.

The production name `ninjagoldfinch-lol-prod` may change on the next rotation (owner, 2026-10-19).

## Revoke a key

- CLI: `riot-proxy key revoke <id-or-name>`. The row and hash stay, so the key can never be reissued (`riot-proxy:src/consumers.rs:226-251`). riot-proxy's auth cache may keep accepting the key for up to 60 s (`riot-proxy:src/http/auth.rs:29-30`).
- Admin API: `DELETE /v1/admin/consumers/{id}` revokes it and drops it from the auth cache at once (`riot-proxy:src/routes/admin.rs:240-280`).

A revoked or wrong key makes riot-proxy answer `UNAUTHORIZED` (401). The site shows "Temporarily unavailable" and logs `proxy 401 GET <path> request-id=…` (`src/lib/server/errors.ts:32`, `src/lib/server/proxy.ts:11-17`).

## Auth-off mode for development

A riot-proxy started with `AUTH_DISABLED=true` treats every request as the built-in `dev-local` consumer with `read` and `admin` scopes and a quota of 100,000 a minute (`riot-proxy:src/http/auth.rs:43-52`). riot-proxy refuses to start with it when `ENV=production` (`riot-proxy:src/config.rs:658-662`).

To develop against one:

1. Run riot-proxy locally with `AUTH_DISABLED=true` and your own development `RIOT_API_KEY` (riot-proxy's `.env.example`).
2. In the site's `.env`, set `PROXY_URL=http://127.0.0.1:8080` and leave `PROXY_KEY=` empty.
3. `just dev`. With `NODE_ENV` unset the empty key is accepted and no header is sent.

The dormant LAN dev proxy (`192.168.68.46:8080`) ran this way (`docs/PROGRESS.md:123`). Production cannot: riot-proxy forbids it and the site requires a key under `NODE_ENV=production`.

## Limits on the key

Covered in [../architecture/concurrency-and-rate-limiting.md](../architecture/concurrency-and-rate-limiting.md): the per-key quota (`QUOTA_EXCEEDED`, 429), Riot's limits (`RATE_LIMITED`), and the per-player refresh window. Quotas are held in riot-proxy's memory and reset when it restarts (`riot-proxy:src/http/quota.rs:55-58`).

---

**Sources:** `src/env.ts:L5-L30`, `src/lib/server/env.ts:L42-L55`, `src/lib/server/proxy.ts:L11-L17,L136-L147`, `src/lib/server/errors.ts:L32`, `tests/record-fixture.ts:L105-L108`, `playwright.config.ts:L26`, `.gitignore:L15-L18`, `.dockerignore:L4-L6`, `CLAUDE.md:L15-L17`, `docs/IMPLEMENTATION.md:L194,L201`, `docs/PROGRESS.md:L123`, `riot-proxy:src/consumers.rs:L12-L251`, `riot-proxy:src/cli/key.rs:L10-L57`, `riot-proxy:src/http/auth.rs:L29-L52,L141-L156`, `riot-proxy:src/http/quota.rs:L1-L58`, `riot-proxy:src/config.rs:L658-L662`, `riot-proxy:src/routes/admin.rs:L173-L280`, `riot-proxy:src/routes/docs.rs:L104-L126`, `riot-proxy:docs/CUTOVER.md:L108`, `riot-proxy:README.md:L70-L72`, `riot-proxy:docs/design/07-deployment.md:L75-L93`, `riot-proxy:docs/design/12-object-storage-and-hosting.md:L626-L627`, owner-supplied unit and answers (2026-10-19)
**Last verified:** 2026-11-03 against commit `fbba06d`
