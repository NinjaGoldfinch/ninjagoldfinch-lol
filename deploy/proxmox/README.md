# Preview VM on Proxmox

A Debian 13 VM that builds and runs the site in Docker, on plain HTTP on your LAN at port 3000. It talks to riot-proxy at `PROXY_URL` (by default the dev instance at `http://192.168.68.46:8080`). Adapted from riot-proxy's `deploy/proxmox`, minus the image registry and auto-update timer: the VM builds from a git checkout, and you deploy by hand with `ninjagoldfinch-update`. ADR-010.

Needs Proxmox VE 8 or later, and the `local` storage set to hold snippets once (Datacenter → Storage → local → Content → add "Snippets").

## Create the VM

On the Proxmox host, as root. The repo is private, so fetch it with `gh` (over HTTPS, so no SSH key is needed on the host):

```bash
mkdir -p ~/ninjagoldfinch-lol
gh api repos/NinjaGoldfinch/ninjagoldfinch-lol/tarball/main | tar xz -C ~/ninjagoldfinch-lol --strip-components=1
cd ~/ninjagoldfinch-lol/deploy/proxmox

./create-vm.sh --generate-key                       # DHCP, next free VM id, a login key for this host
# also let your own machines in, using the keys on your GitHub account:
#   curl -fsS https://github.com/NinjaGoldfinch.keys > ~/github-keys.pub
#   ./create-vm.sh --generate-key --ssh-keys ~/github-keys.pub
# static address:   --vmid 211 --ip 192.168.68.51/22 --gw 192.168.68.1
# reuse riot-proxy's cached Debian image: --image-dir /var/tmp/riot-proxy-images
```

Without `gh`, copy the folder over instead: `scp -r deploy/proxmox root@<proxmox-host>:ninjagoldfinch-proxmox`.

`--generate-key` writes an ed25519 keypair (no passphrase) to `/root/.ssh/ninjagoldfinch/<name>-<vmid>` on the host, and the script prints the `ssh -i …` command to use. `./create-vm.sh --help` lists the options: 2 cores, 2 GB RAM and a 16 GB disk by default, login user `web`. `--dry-run` prints the `qm` commands without running anything. `--print-vendor-data` shows what the VM installs: Docker, git, GitHub's SSH host keys, a deploy key, and `ninjagoldfinch-update`.

## First deploy

First boot installs Docker and takes a few minutes. `qm guest cmd <vmid> network-get-interfaces` answers once the guest agent is up, which is a good sign the rest is done too. On the host:

```bash
qm guest exec <vmid> -- cloud-init status --long                      # out-data: "status: done"
qm guest exec <vmid> -- cat /home/web/.ssh/ninjagoldfinch-deploy.pub  # the VM's deploy key
```

Save the `ssh-ed25519 … ninjagoldfinch-deploy@…` line, without the trailing `\n`, and add it to GitHub, read-only (the default):

```bash
echo 'ssh-ed25519 AAAA… ninjagoldfinch-deploy@ninjagoldfinch-web' > /tmp/ngf-deploy.pub
gh repo deploy-key add /tmp/ngf-deploy.pub -R NinjaGoldfinch/ninjagoldfinch-lol --title "ninjagoldfinch-web VM"
```

Then log in with the command `create-vm.sh` printed (`ssh -i /root/.ssh/ninjagoldfinch/<name>-<vmid> web@<vm-ip>`), and on the VM:

```bash
ninjagoldfinch-update                      # clones into /opt/ninjagoldfinch, creates deploy/.env, stops
nano /opt/ninjagoldfinch/deploy/.env       # set PROXY_KEY; ORIGIN is already http://<vm-ip>:3000
ninjagoldfinch-update                      # builds the image on the VM and starts it
curl -s http://localhost:3000/healthz      # {"ok":true}
```

`ORIGIN` is baked into the image at build time (ADR-014). If the VM's address changes, edit it and run `ninjagoldfinch-update` to rebuild; otherwise the Refresh button is refused as a cross-site request.

The image runs with `NODE_ENV=production`, so the site refuses to start without `PROXY_KEY`. The dev riot-proxy runs with auth disabled and ignores the key, so any value works against it. Production needs a real read key: `riot-proxy key create --name ninjagoldfinch-web`.

Open `http://<vm-ip>:3000`.

### If ssh says the host identification has changed

DHCP gave the new VM an address another machine used before, and `known_hosts` still has that machine's key. Check that the key ssh was offered is the VM's own, then drop the old entry:

```bash
qm guest exec <vmid> -- ssh-keygen -lf /etc/ssh/ssh_host_ed25519_key.pub   # compare with the fingerprint ssh showed
ssh-keygen -R <vm-ip>
```

### A VM made without --generate-key

Let the host's root in through the guest agent:

```bash
[ -f ~/.ssh/id_ed25519 ] || ssh-keygen -q -t ed25519 -N '' -f ~/.ssh/id_ed25519
qm guest exec <vmid> -- sh -c "echo '$(cat ~/.ssh/id_ed25519.pub)' >> /home/web/.ssh/authorized_keys"
```

## Updating

```bash
ninjagoldfinch-update            # latest main
ninjagoldfinch-update v0.1.0     # a tag, branch or commit; also how you roll back
docker compose -f /opt/ninjagoldfinch/deploy/compose.yaml logs -f
```

Each run fetches, checks out the ref, rebuilds the image on the VM and restarts the container. The checkout is detached, so nothing on the VM ever commits. Tags follow GitHub: one moved there (like `phase-P2`) is overwritten on the VM, and one deleted there is pruned.

cloud-init installs `ninjagoldfinch-update` once, when the VM is created. To give an existing VM a newer copy, from a checkout:

```bash
scp deploy/proxmox/ninjagoldfinch-update web@<vm-ip>:
ssh web@<vm-ip> 'sudo install -m 755 ninjagoldfinch-update /usr/local/bin/ && rm ninjagoldfinch-update'
```

## Tests

`deploy/proxmox/test.sh` runs in `just check`. It covers shellcheck (when installed), the vendor-data, the dry-run `qm` commands, and `ninjagoldfinch-update` against a throwaway repo with a fake `docker`. It cannot exercise Proxmox or Docker themselves.
