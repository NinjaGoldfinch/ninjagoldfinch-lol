# Releases on production

From `v1.0.0` production runs a release, not a checkout (ADR-054). A `v*` tag builds it ([workflows/release-process.md](../workflows/release-process.md), ADR-052), `deploy.yml` deploys it after the owner's approval (ADR-053), and on `ngf-prod-syd1` `ninja-deploy` (from `NinjaGoldfinch/ninja-actions`) unpacks it, restarts the unit, waits for `/healthz` to report its version (ADR-051) and rolls back by itself if it does not.

| What          | Where                                                                                                         |
| ------------- | ------------------------------------------------------------------------------------------------------------- |
| Releases      | `/srv/ninjagoldfinch-lol/releases/<tag>/`: `build/`, `package.json`, `LICENSE`, `version.json`; newest 5 kept |
| Asset         | `ninjagoldfinch-lol.tar.gz`; staging gets `ninjagoldfinch-lol-staging.tar.gz` ([Staging](#staging))           |
| Live release  | `/srv/ninjagoldfinch-lol/current` → a release; `/srv/ninjagoldfinch-lol/live.json` says which and when        |
| Unit drop-in  | `/etc/systemd/system/ninjagoldfinch-lol.service.d/ninja-deploy.conf`, from `deploy/systemd/ninja-deploy.conf` |
| Deploy config | `/etc/ninja-deploy/ninjagoldfinch-lol.conf` (unit, health URL), written by `deploy-host-add.sh`               |
| Settings      | Unchanged: `/etc/ninjagoldfinch-lol/env`, read by the unit, never part of a release                           |

## Deploy, roll back, look

```sh
gh workflow run deploy.yml -R NinjaGoldfinch/ninjagoldfinch-lol -f env=prod -f version=vX.Y.Z
gh run watch -R NinjaGoldfinch/ninjagoldfinch-lol      # approve in the Actions tab when asked
```

Rolling back is deploying the previous tag the same way; it is still on the host, so nothing is uploaded. On the host, `ls -l /srv/ninjagoldfinch-lol/current`, `cat /srv/ninjagoldfinch-lol/live.json` and `curl -s http://127.0.0.1:3000/healthz` say what runs.

## Moving production from the checkout (once)

The unit ran `node build` in `/opt/ninjagoldfinch-lol` ([install.md](./install.md)). `deploy-host-add.sh --adopt` moves a single binary, so the site is moved by hand the same way: the release goes in as the first one, a drop-in points the unit at it, and removing the drop-in goes back. The checkout stays until the release has run for a while.

### 1. Release `v1.0.0`

Merge the DEP pull requests in order, then tag the merge commit whose `package.json` says `1.0.0`:

```sh
git fetch origin main
git show origin/main:package.json | grep '"version"'      # "version": "1.0.0"
git tag v1.0.0 origin/main
git push origin v1.0.0
gh run watch -R NinjaGoldfinch/ninjagoldfinch-lol           # the Release run
gh release view v1.0.0 -R NinjaGoldfinch/ninjagoldfinch-lol # ninjagoldfinch-lol.tar.gz, SHA256SUMS
```

### 2. The `prod` environment on GitHub

As riot-proxy's: the owner as required reviewer, deploys from `main` only, the host and its key copied from riot-proxy's environment, and a deploy key of its own.

```sh
R=NinjaGoldfinch/ninjagoldfinch-lol
gh api -X PUT "repos/$R/environments/prod" --input - <<'EOF'
{"reviewers":[{"type":"User","id":101228347}],"prevent_self_review":false,
 "deployment_branch_policy":{"protected_branches":false,"custom_branch_policies":true}}
EOF
gh api -X POST "repos/$R/environments/prod/deployment-branch-policies" -f name=main -f type=branch

gh variable set DEPLOY_HOST -R "$R" --env prod \
  --body "$(gh variable get DEPLOY_HOST -R NinjaGoldfinch/riot-proxy --env prod)"
gh variable set DEPLOY_KNOWN_HOSTS -R "$R" --env prod \
  --body "$(gh variable get DEPLOY_KNOWN_HOSTS -R NinjaGoldfinch/riot-proxy --env prod)"

ssh-keygen -t ed25519 -N '' -C ci-ninjagoldfinch-lol-prod -f /tmp/deploy-key
gh secret set DEPLOY_SSH_KEY -R "$R" --env prod < /tmp/deploy-key
cat /tmp/deploy-key.pub                                    # for step 3
rm /tmp/deploy-key /tmp/deploy-key.pub
```

### 3. `ninja-deploy` for the site, on `ngf-prod-syd1`

`deploy-host-setup.sh` already ran on this host for riot-proxy; check, then add the site with the public key from step 2:

```sh
test -x /usr/local/sbin/ninja-deploy && cat /etc/ninja-deploy/env   # ENV=prod
cd "$(mktemp -d)"
curl -fsSL https://github.com/NinjaGoldfinch/ninja-actions/archive/refs/heads/main.tar.gz | tar -xz
sudo ./ninja-actions-main/infra/deploy-host-add.sh ninjagoldfinch-lol \
  --unit ninjagoldfinch-lol.service \
  --health-url http://127.0.0.1:3000/healthz \
  --key 'ssh-ed25519 AAAA... ci-ninjagoldfinch-lol-prod'
```

It ends with "Nothing is live yet". The site is still running from the checkout.

### 4. Put `v1.0.0` in place and switch the unit to it

```sh
cd "$(mktemp -d)"
base=https://github.com/NinjaGoldfinch/ninjagoldfinch-lol/releases/download/v1.0.0
curl -fsSLO "$base/ninjagoldfinch-lol.tar.gz"
curl -fsSLO "$base/SHA256SUMS"
sha256sum --strict -c SHA256SUMS                           # ninjagoldfinch-lol.tar.gz: OK

rel=/srv/ninjagoldfinch-lol/releases/v1.0.0
sudo -u deploy mkdir -m 0755 "$rel"
sudo -u deploy tar -xzf - -C "$rel" --strip-components=1 --no-same-owner < ninjagoldfinch-lol.tar.gz
cat "$rel/version.json"                                    # "version":"v1.0.0"
sudo -u deploy ln -sfn "$rel" /srv/ninjagoldfinch-lol/current

sudo install -d /etc/systemd/system/ninjagoldfinch-lol.service.d
curl -fsSL https://raw.githubusercontent.com/NinjaGoldfinch/ninjagoldfinch-lol/v1.0.0/deploy/systemd/ninja-deploy.conf |
  sudo tee /etc/systemd/system/ninjagoldfinch-lol.service.d/ninja-deploy.conf >/dev/null
sudo systemctl daemon-reload
sudo systemctl restart ninjagoldfinch-lol

# Node takes a second or so to listen: wait, as ninja-deploy does, before judging.
for i in $(seq 30); do curl -fsS http://127.0.0.1:3000/healthz 2>/dev/null && break; sleep 1; done; echo
                                                           # {"ok":true,"version":"1.0.0"}
curl -sI https://ninjagoldfinch.lol/champions | head -1    # 200
systemctl show ninjagoldfinch-lol -p ExecStart | grep -o '/srv/[^ ;]*'
```

Checking straight after the restart gets no answer from `/healthz` and a 502 through Cloudflare while Node starts; that is not a failure. If `/healthz` has not answered `1.0.0` after the 30 s wait, go back to the checkout and read the journal:

```sh
sudo rm /etc/systemd/system/ninjagoldfinch-lol.service.d/ninja-deploy.conf
sudo systemctl daemon-reload && sudo systemctl restart ninjagoldfinch-lol
sudo journalctl -u ninjagoldfinch-lol -n 50 --no-pager
```

### 5. Prove the pipeline

Deploy the same tag through `deploy.yml`. The host already has it, so this skips the upload, restarts, health-checks and writes `live.json`:

```sh
gh workflow run deploy.yml -R NinjaGoldfinch/ninjagoldfinch-lol -f env=prod -f version=v1.0.0
gh run watch -R NinjaGoldfinch/ninjagoldfinch-lol          # approve when asked
cat /srv/ninjagoldfinch-lol/live.json                      # on the host
```

### 6. Retire the checkout deploy

- Take the `ninja-lol` entry out of `~/.config/update-all/projects.conf`, so `update-all` stops building `/opt/ninjagoldfinch-lol`. Its builds no longer run, and its restarts would only restart the release.
- Keep `/opt/ninjagoldfinch-lol` as the fallback above until a few releases have deployed, then remove it, its deploy key and `/etc/sudoers.d/update-all-site`.

## Staging

Every release also deploys to staging, `https://staging.ninjagoldfinch.lol`, with no approval: `release.yml` calls `deploy.yml` with `env: staging` once the release is published (ADR-057). Prod still waits for the owner. Staging runs on `ngf-mon-syd1` (OVH, `ENV=staging` in `/etc/ninja-deploy/env`), next to ninja-monitor and the staging riot-proxy, behind Cloudflare Access on its own tunnel (`ngf-staging`, `staging.ninjagoldfinch.lol` → `127.0.0.1:3000`).

The origin is fixed at build time (ADR-014), so each release carries two tarballs from the same commit, listed in one `SHA256SUMS`: `ninjagoldfinch-lol.tar.gz` for `https://ninjagoldfinch.lol` and `ninjagoldfinch-lol-staging.tar.gz` for `https://staging.ninjagoldfinch.lol`. `deploy.yml` picks the tarball by environment; `/healthz` reports the same version from both.

Staging is behind Access, so check it from the box on loopback (`curl -s http://127.0.0.1:3000/healthz`), or in a browser after the Access login. A CI check against the public hostname would need an Access service token (not set up).

To deploy or roll back staging by hand: `gh workflow run deploy.yml -R NinjaGoldfinch/ninjagoldfinch-lol -f env=staging -f version=vX.Y.Z` (no approval).

### Setting up staging (once)

Do these before tagging the next release; until then its staging job fails, though the release itself is published. Releases before the one that brings this (`v1.0.2` and older) have no staging tarball, so the first staging deploy is the next release.

**1. The `staging` environment on GitHub.** No reviewer; deploys from `main` (by hand) and from `v*` tags (`release.yml` runs on the tag). Its own deploy key:

```sh
R=NinjaGoldfinch/ninjagoldfinch-lol
gh api -X PUT "repos/$R/environments/staging" \
  -F 'deployment_branch_policy[protected_branches]=false' \
  -F 'deployment_branch_policy[custom_branch_policies]=true'
gh api -X POST "repos/$R/environments/staging/deployment-branch-policies" -f name=main -f type=branch
gh api -X POST "repos/$R/environments/staging/deployment-branch-policies" -f name='v*' -f type=tag

gh variable set DEPLOY_HOST -R "$R" -e staging --body 51.161.153.34
gh variable set DEPLOY_KNOWN_HOSTS -R "$R" -e staging \
  --body '51.161.153.34 ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIPPi3xfSW5vhdsKH4yEaZidaQSVaXT5h8B5/LE+s6UUB'

ssh-keygen -t ed25519 -N '' -C ci-ninjagoldfinch-lol-staging -f /tmp/deploy-key
gh secret set DEPLOY_SSH_KEY -R "$R" -e staging < /tmp/deploy-key
cat /tmp/deploy-key.pub                                    # for step 3
rm /tmp/deploy-key /tmp/deploy-key.pub
```

The host key's SHA256 fingerprint is `mmH6z4Rh/xdv/rweuR7awTeUy41kan3pGQxPGWQn5gU`; check the line with `ssh-keyscan -t ed25519 51.161.153.34 | ssh-keygen -lf -`.

**2. The site on `ngf-mon-syd1`.** A fresh install: no checkout, the unit runs the release directly. The staging riot-proxy must be up and give the site a key of its own (made on the staging riot-proxy, never the production one):

```sh
curl -s http://127.0.0.1:8080/readyz; echo               # the staging riot-proxy answers
node --version                                            # v22.18 or later
ss -ltn 'sport = :3000'                                   # nothing listening yet

sudo useradd --system --no-create-home --shell /usr/sbin/nologin ninjagoldfinch-lol
sudo install -d -m 0755 /etc/ninjagoldfinch-lol
sudo sh -c 'umask 077; cat > /etc/ninjagoldfinch-lol/env' <<'ENV'
NODE_ENV=production
HOST=127.0.0.1
PORT=3000
PROXY_URL=http://127.0.0.1:8080
PROXY_KEY=<the site's key from the STAGING riot-proxy>
ENV
sudo stat -c '%a %U' /etc/ninjagoldfinch-lol/env          # 600 root

sudo tee /etc/systemd/system/ninjagoldfinch-lol.service >/dev/null <<'UNIT'
[Unit]
Description=ninjagoldfinch.lol website (staging)
After=network-online.target riot-proxy.service
Wants=network-online.target

[Service]
User=ninjagoldfinch-lol
EnvironmentFile=/etc/ninjagoldfinch-lol/env
WorkingDirectory=/srv/ninjagoldfinch-lol/current
ExecStart=/usr/bin/node build
Restart=always
RestartSec=2
ProtectSystem=strict
PrivateTmp=yes
NoNewPrivileges=yes

[Install]
WantedBy=multi-user.target
UNIT
sudo systemd-analyze verify /etc/systemd/system/ninjagoldfinch-lol.service
sudo systemctl daemon-reload
sudo systemctl enable ninjagoldfinch-lol                  # enable, do not start: no release yet
```

It is production's unit ([install.md](./install.md)) with the release as its working directory, so it needs no drop-in. Do not start it: `/srv/ninjagoldfinch-lol/current` does not exist until the first deploy, which starts it.

**3. `ninja-deploy` for the site**, with the public key from step 1:

```sh
cd "$(mktemp -d)"
curl -fsSL https://github.com/NinjaGoldfinch/ninja-actions/archive/refs/heads/main.tar.gz | tar -xz
sudo ./ninja-actions-main/infra/deploy-host-add.sh ninjagoldfinch-lol \
  --unit ninjagoldfinch-lol.service \
  --health-url http://127.0.0.1:3000/healthz \
  --key 'ssh-ed25519 AAAA... ci-ninjagoldfinch-lol-staging'
```

**4. The first staging deploy** comes with the next release (a `package.json` bump, then its tag). Watch its "Deploy to staging" job, then on the box:

```sh
for i in $(seq 30); do curl -fsS http://127.0.0.1:3000/healthz 2>/dev/null && break; sleep 1; done; echo
cat /srv/ninjagoldfinch-lol/live.json                     # "env":"staging"
```

---

**Sources:** `deploy/systemd/ninja-deploy.conf`, `.github/workflows/deploy.yml`, `.github/workflows/release.yml`, `scripts/package.sh`, `docs/DECISIONS.md` (ADR-051 to ADR-054, ADR-057), `ninja-actions:README.md`, `ninja-actions:infra/deploy.sh`, `ninja-actions:infra/deploy-host-add.sh`, riot-proxy's `prod` environment (read 2026-11-05), the staging handover from the ninja-actions session (2026-11-05), owner-supplied unit (inventory section 14)
**Last verified:** 2026-11-05, during the move: `v1.0.0` started from `/srv` and served pages within a second of the restart
