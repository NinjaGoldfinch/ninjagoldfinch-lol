# Releases on production

From `v1.0.0` production runs a release, not a checkout (ADR-054). A `v*` tag builds it ([workflows/release-process.md](../workflows/release-process.md), ADR-052), `deploy.yml` deploys it after the owner's approval (ADR-053), and on `ngf-prod-syd1` `ninja-deploy` (from `NinjaGoldfinch/ninja-actions`) unpacks it, restarts the unit, waits for `/healthz` to report its version (ADR-051) and rolls back by itself if it does not.

| What          | Where                                                                                                         |
| ------------- | ------------------------------------------------------------------------------------------------------------- |
| Releases      | `/srv/ninjagoldfinch-lol/releases/<tag>/`: `build/`, `package.json`, `LICENSE`, `version.json`; newest 5 kept |
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
for i in $(seq 30); do curl -fsS http://127.0.0.1:3000/healthz && break; sleep 1; done; echo
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

---

**Sources:** `deploy/systemd/ninja-deploy.conf`, `.github/workflows/deploy.yml`, `.github/workflows/release.yml`, `scripts/package.sh`, `docs/DECISIONS.md` (ADR-051 to ADR-054), `ninja-actions:README.md`, `ninja-actions:infra/deploy.sh`, `ninja-actions:infra/deploy-host-add.sh`, riot-proxy's `prod` environment (read 2026-11-05), owner-supplied unit (inventory section 14)
**Last verified:** 2026-11-05, during the move: `v1.0.0` started from `/srv` and served pages within a second of the restart
