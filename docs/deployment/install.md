# Install on a fresh server

Step by step, how to install ninjagoldfinch.lol on a new Ubuntu 26.04 server next to riot-proxy, as production `ngf-prod-syd1` was installed on 2026-10-13. It reproduces the real systemd unit; there is no reverse proxy to configure, because a Cloudflare Tunnel carries all traffic.

This is the checkout install production ran from 2026-10-13 until `v1.0.0`, and the fallback ADR-054 keeps. Since `v1.0.0` production runs releases from `/srv/ninjagoldfinch-lol/current`, deployed by `ninja-deploy` (ADR-052 to ADR-054). For a new host that runs releases from the start, install the unit as in [releases.md, Setting up staging](./releases.md#setting-up-staging-once), step 2, which is this page's unit with the release as its working directory and a state directory, and skip steps 2, 4 and 5 here; the other steps apply as they are.

## Before you start

- riot-proxy is installed on the same host, listening on `127.0.0.1:8080`, and healthy (`curl -s http://127.0.0.1:8080/readyz`). Installing riot-proxy is riot-proxy's documentation, not this page.
- You have a read-scope riot-proxy consumer key for the site (production's is named `ninjagoldfinch-lol-prod`); see [integration/authentication.md](../integration/authentication.md). riot-proxy refuses `AUTH_DISABLED` in production, so the site needs a key (`riot-proxy:src/config.rs:752-756`).
- You can add a deploy key to the GitHub repo `NinjaGoldfinch/ninjagoldfinch-lol` (public; the checkout is cloned over SSH with that key, as production's was).
- You have the Cloudflare account that owns the `ninjagoldfinch.lol` zone and its Tunnel.

What this install creates, matching [overview.md](./overview.md#who-owns-what-on-the-host):

| Item        | Value                                                                     |
| ----------- | ------------------------------------------------------------------------- |
| System user | `ninjagoldfinch-lol`, home `/opt/ninjagoldfinch-lol-home`, no login shell |
| Checkout    | `/opt/ninjagoldfinch-lol`, owned by that user                             |
| Settings    | `/etc/ninjagoldfinch-lol/env`, root-only                                  |
| Unit        | `/etc/systemd/system/ninjagoldfinch-lol.service`                          |
| Listens on  | `127.0.0.1:3000`                                                          |

## 1. OS packages

```sh
sudo apt-get update
sudo apt-get install -y nodejs git
node --version     # must be v22.18 or later
```

Ubuntu 26.04's packaged Node is new enough (`riot-proxy:docs/design/12-object-storage-and-hosting.md:621`; `docs/DECISIONS.md:513`). The repo's `.npmrc` sets `engine-strict=true`, so `pnpm install` refuses an older Node (`.npmrc:1`, `package.json:8-10`).

## 2. pnpm

```sh
sudo npm install -g pnpm@12.10.1
pnpm --version     # 12.10.1
```

The repo pins `pnpm@12.10.1` (`package.json:7`). Ubuntu 26.04's `node-corepack` (0.24) cannot load pnpm 12, so production installed it with `npm install -g` rather than `corepack enable` (`riot-proxy:docs/design/12-object-storage-and-hosting.md:809-811`). If `npm` is not on the box, `sudo apt-get install -y npm` first.

## 3. System user and directories

```sh
sudo useradd --system --create-home --home /opt/ninjagoldfinch-lol-home \
  --shell /usr/sbin/nologin ninjagoldfinch-lol
sudo install -d -o ninjagoldfinch-lol -g ninjagoldfinch-lol /opt/ninjagoldfinch-lol
```

The `useradd` line is the one production used (`riot-proxy:docs/design/12-object-storage-and-hosting.md:622`). The checkout directory is separate from the home so the home can hold the user's SSH key and pnpm's store.

## 4. Deploy key

Generate a new read-only key on this server; never copy one from another machine (`riot-proxy:docs/design/12-object-storage-and-hosting.md:625-627`).

```sh
sudo -H -u ninjagoldfinch-lol ssh-keygen -t ed25519 -N '' -C ninjagoldfinch-lol@$(hostname) \
  -f /opt/ninjagoldfinch-lol-home/.ssh/id_ed25519
sudo cat /opt/ninjagoldfinch-lol-home/.ssh/id_ed25519.pub
```

Add the public half on GitHub: repo → Settings → Deploy keys → Add, with write access off. Then check GitHub's host key fingerprint against GitHub's published fingerprints when SSH first asks.

> **TODO (unverified):** The key path and file name production uses for the deploy key are not recorded anywhere; the commands above use SSH's default (`~/.ssh/id_ed25519`) so that plain `git pull` finds it. Check on the host with `sudo ls /opt/ninjagoldfinch-lol-home/.ssh/`.

## 5. Clone and build

```sh
cd /opt/ninjagoldfinch-lol
sudo -H -u ninjagoldfinch-lol git clone git@github.com:NinjaGoldfinch/ninjagoldfinch-lol.git .
sudo -H -u ninjagoldfinch-lol pnpm install --frozen-lockfile
sudo -H -u ninjagoldfinch-lol env ORIGIN=https://ninjagoldfinch.lol pnpm build
```

- `ORIGIN` must be given on the build command: adapter-node 6 does not read it at runtime, and form posts (Refresh) are accepted only from the origin fixed at build time (`vite.config.ts:30-33`, ADR-014, `README.md:207`). Without it the site guesses the origin from the `Host` header and assumes HTTPS.
- The build output is `build/`; `node build` runs it (`README.md:184`).
- The build itself never reads `PROXY_URL` or `PROXY_KEY`: env validation is skipped while building (`src/env.ts:14-18`).

## 6. Settings file

Create `/etc/ninjagoldfinch-lol/env`, readable by root only (systemd reads it as root before dropping to the service user):

```sh
sudo install -d -m 0755 /etc/ninjagoldfinch-lol
sudo sh -c 'umask 077; cat > /etc/ninjagoldfinch-lol/env' <<'EOF'
NODE_ENV=production
HOST=127.0.0.1
PORT=3000
PROXY_URL=http://127.0.0.1:8080
PROXY_KEY=<the site's read key from riot-proxy>
EOF
sudo stat -c '%a %U' /etc/ninjagoldfinch-lol/env   # 600 root
```

These five names are the ones production set on 2026-10-19 (owner-supplied, [inventory section 14](../_meta/inventory.md#14-owner-supplied-evidence-not-in-any-repo)). Production's settings now also hold `STATUS_TOKEN`, for `/api/status` (`README.md:192`, ADR-062); `EVENTS_URL` is optional (ADR-063). `HOST=127.0.0.1` keeps the site off the public interface (ADR-038, `docs/DECISIONS.md:509`). Every setting is described in [configuration.md](./configuration.md). Never paste the key into a shell history you keep, a ticket or this repo.

## 7. systemd unit

Create `/etc/systemd/system/ninjagoldfinch-lol.service` with exactly the production unit (owner-supplied `systemctl cat ninjagoldfinch-lol`, 2026-10-19):

```ini
[Unit]
Description=ninjagoldfinch.lol website
After=network-online.target riot-proxy.service
Wants=network-online.target

[Service]
User=ninjagoldfinch-lol
EnvironmentFile=/etc/ninjagoldfinch-lol/env
WorkingDirectory=/opt/ninjagoldfinch-lol
ExecStart=/usr/bin/node build
Restart=always
RestartSec=2
ProtectSystem=strict
PrivateTmp=yes
NoNewPrivileges=yes

[Install]
WantedBy=multi-user.target
```

```sh
sudo systemd-analyze verify /etc/systemd/system/ninjagoldfinch-lol.service
sudo systemctl daemon-reload
sudo systemctl enable --now ninjagoldfinch-lol
```

Notes on the unit:

- `ProtectSystem=strict` makes the file system read-only for the service. The site writes to one place only, its state directory `/var/lib/ninjagoldfinch-lol/`: two small files for the events (ADR-063). `StateDirectory=ninjagoldfinch-lol` makes that directory and keeps it writable under `ProtectSystem=strict`; it is not in the unit above but in the drop-in that runs a release ([releases.md](./releases.md#the-state-directory-for-events-once)). Without it the site runs as before and sends no `deployed` event. Everything else it holds is in memory ([data/caching.md](../data/caching.md)).
- `After=riot-proxy.service` orders start-up but does not require riot-proxy; if riot-proxy is down the site still starts and serves 503 for data pages.
- `ExecStart=/usr/bin/node` assumes Ubuntu's package; adjust if Node lives elsewhere (`command -v node`).

The unit text passes `systemd-analyze verify` (checked 2026-10-20).

## 8. Verify locally

```sh
systemctl is-active ninjagoldfinch-lol                 # active
sudo ss -ltnp | grep ':3000 '                          # 127.0.0.1:3000 only
curl -s http://127.0.0.1:3000/healthz                  # {"ok":true,"version":"…"}
curl -s -o /dev/null -w '%{http_code}\n' http://127.0.0.1:3000/champions   # 200
sudo journalctl -u ninjagoldfinch-lol -n 20 --no-pager # "Listening on http://127.0.0.1:3000"
```

If the service exits at once, the journal shows SvelteKit's `env_invalid` with the variable, for example `PROXY_KEY is required when NODE_ENV=production` or `PROXY_URL is required` (`src/lib/server/env.ts:12-15,61-66`). These outputs were reproduced on 2026-10-20 by running the same build with the same five variables outside systemd.

`/healthz` does not touch riot-proxy (`src/routes/healthz/+server.ts:6-9`); `/champions` does, so a 503 there with a healthy `/healthz` means the site cannot use riot-proxy ([operations/troubleshooting.md](../operations/troubleshooting.md)).

## 9. Cloudflare Tunnel

There is no nginx or Caddy. `cloudflared` runs as a system service with `--token-file /etc/cloudflared/token` and forwards the public hostname to the site (`riot-proxy:docs/design/12-object-storage-and-hosting.md:811-813`).

If `cloudflared` is already running on the host for riot-proxy, add nothing on the host. Otherwise:

1. Install `cloudflared` from Cloudflare's apt repository (`riot-proxy:docs/design/12-object-storage-and-hosting.md:811-812`).
2. Put the Tunnel token in `/etc/cloudflared/token`, root-only, and install the service so it reads `--token-file /etc/cloudflared/token`.
3. In the Cloudflare dashboard, make sure the Tunnel has the public hostname `ninjagoldfinch.lol` → `http://127.0.0.1:3000` (`riot-proxy:docs/design/13-admin-dashboard.md:66`).

Moving the Tunnel's connector to a new host needs no DNS change (`riot-proxy:docs/design/12-object-storage-and-hosting.md:542-545`).

> **TODO (unverified):** The exact `cloudflared` install commands and service unit on `ngf-prod-syd1` are not recorded in either repo. Read them with `systemctl cat cloudflared` and add them here.

## 10. Verify from outside

```sh
curl -sI https://ninjagoldfinch.lol/healthz | head -3
curl -sI https://ninjagoldfinch.lol/champions | grep -i -E '^(HTTP|cache-control|cf-cache-status)'
```

Expect `cache-control: public, s-maxage=600, stale-while-revalidate=600` on `/champions` (`src/lib/server/cache.ts:11`). Then open a profile and press Refresh: a 403 means the build's `ORIGIN` does not match the public URL; rebuild as in step 5.

## Coordination with riot-proxy on the same host

- Do not use port 8080 or any of riot-proxy's paths (`/var/lib/riot-proxy`, `/etc/riot-proxy`); see [overview.md](./overview.md#who-owns-what-on-the-host).
- A riot-proxy restart does not need a site restart; the site reconnects per request.
- ninja-monitor watches the `ninjagoldfinch-lol` unit with a 1 GiB memory limit (`riot-proxy:docs/design/12-object-storage-and-hosting.md:839-842`); a new host needs the same entry in ninja-monitor's configuration, by default `/etc/ninja-monitor/config.toml` (`ninja-monitor:README.md:254`, `v0.2.3`).

---

**Sources:** owner-supplied unit and env names (inventory section 14), `package.json:L7-L10`, `.npmrc:L1`, `vite.config.ts:L30-L33`, `src/env.ts:L14-L18`, `src/lib/server/env.ts:L12-L66`, `src/lib/server/cache.ts:L11`, `src/routes/healthz/+server.ts:L6-L9`, `README.md:L184-L207`, `docs/DECISIONS.md:L171-L184,L500-L516` and ADR-052 to ADR-054, ADR-062, ADR-063, `docs/deployment/releases.md` ("Setting up staging"), `riot-proxy:src/config.rs:L752-L756`, `riot-proxy:docs/design/12-object-storage-and-hosting.md:L542-L545,L616-L635,L808-L813,L839-L842`, `riot-proxy:docs/design/13-admin-dashboard.md:L66` (riot-proxy at `7531561`), `ninja-monitor:README.md:L254` (`v0.2.3`)
**Last verified:** 2026-11-09 against commit `8a2bb46` (statements and citations; the build, env file and start-up checks last run locally on 2026-10-20; not run on a fresh Ubuntu 26.04 server)
