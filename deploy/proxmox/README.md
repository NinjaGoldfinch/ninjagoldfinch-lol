# Preview VM on Proxmox

A Debian 13 VM that builds and runs the site in Docker, on plain HTTP on your LAN at port 3000. It talks to riot-proxy at `PROXY_URL` (by default the dev instance at `http://192.168.68.46:8080`). Adapted from riot-proxy's `deploy/proxmox`, minus the image registry and auto-update timer: the VM builds from a git checkout, and you deploy by hand with `ninjagoldfinch-update`. ADR-010.

Needs Proxmox VE 8 or later, and the `local` storage set to hold snippets once (Datacenter → Storage → local → Content → add "Snippets").

## Create the VM

The repo is private, so copy this folder to the Proxmox host rather than downloading it there:

```bash
# from a machine with the repo
scp -r deploy/proxmox root@<proxmox-host>:ninjagoldfinch-proxmox

# on the Proxmox host, as root
cd ninjagoldfinch-proxmox
./create-vm.sh --ssh-keys ~/.ssh/my-laptop.pub             # DHCP, next free VM id
# or: ./create-vm.sh --ssh-keys key.pub --vmid 211 --ip 192.168.68.51/22 --gw 192.168.68.1
# reuse riot-proxy's cached Debian image: --image-dir /var/tmp/riot-proxy-images
```

`./create-vm.sh --help` lists the options: 2 cores, 2 GB RAM and a 16 GB disk by default, login user `web`. `--dry-run` prints the `qm` commands without running anything, and `--print-vendor-data` shows what the VM installs (Docker, git, GitHub's SSH host keys, a deploy key, and `ninjagoldfinch-update`).

## First deploy

First boot installs Docker and takes a few minutes. Then:

```bash
ssh web@<vm-ip>
cat ~/.ssh/ninjagoldfinch-deploy.pub
```

Add that key to GitHub, read-only: NinjaGoldfinch/ninjagoldfinch-lol → Settings → Deploy keys → Add deploy key, with "Allow write access" unticked. Then, on the VM:

```bash
ninjagoldfinch-update                      # clones into /opt/ninjagoldfinch, creates deploy/.env, stops
nano /opt/ninjagoldfinch/deploy/.env       # set PROXY_KEY; ORIGIN is already http://<vm-ip>:3000
ninjagoldfinch-update                      # builds the image on the VM and starts it
```

The image runs with `NODE_ENV=production`, so the site refuses to start without `PROXY_KEY`. The dev riot-proxy runs with auth disabled and ignores the key, so any value works against it. Production needs a real read key: `riot-proxy key create --name ninjagoldfinch-web`.

Open `http://<vm-ip>:3000`.

## Updating

```bash
ninjagoldfinch-update            # latest main
ninjagoldfinch-update v0.1.0     # a tag, branch or commit; also how you roll back
docker compose -f /opt/ninjagoldfinch/deploy/compose.yaml logs -f
```

Each run fetches, checks out the ref, rebuilds the image on the VM and restarts the container. The checkout is detached, so nothing on the VM ever commits.

## Tests

`deploy/proxmox/test.sh` runs in `just check`. It covers shellcheck (when installed), the vendor-data, the dry-run `qm` commands, and `ninjagoldfinch-update` against a throwaway repo with a fake `docker`. It cannot exercise Proxmox or Docker themselves.
