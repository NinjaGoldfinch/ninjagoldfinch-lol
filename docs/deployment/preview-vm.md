# Preview VM (dormant)

The LAN preview VM: a Debian 13 VM on a Proxmox host that built and ran ninjagoldfinch.lol in Docker on plain HTTP at port 3000. The VM was deleted and may be recreated (owner, 2026-10-19); its scripts stay in `deploy/proxmox/` and are still tested by `just check`. Production does not use any of this ([overview.md](./overview.md)).

## What it is

| Fact               | Value                                                                                                                                  | Source                                                                                 |
| ------------------ | -------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| Guest OS           | Debian 13 (trixie) generic cloud image, checked against Debian's `SHA512SUMS`                                                          | `deploy/proxmox/create-vm.sh:13-14`                                                    |
| Defaults           | VM name `ninjagoldfinch-web`, 2 cores, 2048 MB, 16 GB disk, DHCP, login user `web`                                                     | `deploy/proxmox/create-vm.sh:22-38`, `--help`                                          |
| Runs               | One Docker container `web` built from `Dockerfile`, published on port 3000                                                             | `deploy/compose.yaml:4-14`                                                             |
| Image              | Two-stage `node:22-alpine`; runs `node build` as user `node` with `NODE_ENV=production`; Docker `HEALTHCHECK` on `/healthz` every 30 s | `Dockerfile:1-23`                                                                      |
| Last known address | `http://192.168.68.47:3000`                                                                                                            | `docs/DECISIONS.md:175`, [integration/environments.md](../integration/environments.md) |
| riot-proxy         | Whatever `PROXY_URL` in `deploy/.env` names; there is no LAN dev proxy any more (SPD-01)                                               | `deploy/proxmox/README.md:5`                                                           |
| Decision           | ADR-010; production chose systemd instead (ADR-038)                                                                                    | `docs/DECISIONS.md:113-127,500-516`                                                    |

A recreated VM needs `PROXY_URL` pointing at a riot-proxy it can reach, and since the image runs with `NODE_ENV=production`, a `PROXY_KEY` (any value if that riot-proxy runs with auth off) (`deploy/proxmox/README.md:55-57`).

## Recreating it

The full procedure is `deploy/proxmox/README.md`. In outline, on the Proxmox host as root:

1. Fetch the private repo's `deploy/proxmox` folder with `gh api repos/NinjaGoldfinch/ninjagoldfinch-lol/tarball/main` or `scp` (`deploy/proxmox/README.md:11-26`).
2. Create the VM:

   ```sh
   ./create-vm.sh --generate-key          # add --dry-run to print the qm commands only
   ```

   `--generate-key` writes a login keypair to `/root/.ssh/ninjagoldfinch/<name>-<vmid>`. cloud-init vendor-data installs Docker and git, pins GitHub's SSH host keys, creates a read-only deploy key for the `web` user and installs `ninjagoldfinch-update` (`deploy/proxmox/create-vm.sh:6-8`, `deploy/proxmox/README.md:28`). `./create-vm.sh --print-vendor-data` shows exactly what is installed.

3. Wait for cloud-init, read the VM's deploy key and add it to GitHub read-only (`deploy/proxmox/README.md:32-44`).
4. On the VM, run `ninjagoldfinch-update` once (clones into `/opt/ninjagoldfinch`, writes `deploy/.env` with `ORIGIN=http://<vm-ip>:3000`, mode 600, and stops), set `PROXY_URL` and `PROXY_KEY` in `deploy/.env`, then run it again to build and start (`deploy/proxmox/ninjagoldfinch-update:37-48`).
5. Check `curl -s http://localhost:3000/healthz` returns `{"ok":true}`.

`create-vm.sh` options, from `./create-vm.sh --help` (run 2026-10-20):

| Option                                      | Default                          |
| ------------------------------------------- | -------------------------------- |
| `--ssh-keys FILE` or `--generate-key`       | one is required                  |
| `--key-dir DIR`                             | `/root/.ssh/ninjagoldfinch`      |
| `--vmid N`                                  | the cluster's next free id       |
| `--name NAME`                               | `ninjagoldfinch-web`             |
| `--storage ID` / `--snippets ID`            | `local-lvm` / `local`            |
| `--bridge BRIDGE`                           | `vmbr0`                          |
| `--cores N` / `--memory MB` / `--disk SIZE` | `2` / `2048` / `16G`             |
| `--ip CIDR\|dhcp` / `--gw ADDR`             | `dhcp` / none                    |
| `--user NAME`                               | `web`                            |
| `--image-dir DIR`                           | `/var/tmp/ninjagoldfinch-images` |
| `--dry-run`, `--print-vendor-data`          | off                              |

## Deploying and rolling back on it

```sh
ninjagoldfinch-update            # latest main
ninjagoldfinch-update <ref>      # a tag, branch or commit; also how you roll back
docker compose -f /opt/ninjagoldfinch/deploy/compose.yaml logs -f
```

Each run fetches with the deploy key, prunes and force-updates tags to match GitHub, checks the ref out detached, runs `docker compose -f deploy/compose.yaml up -d --build`, and prunes dangling images (`deploy/proxmox/ninjagoldfinch-update:17-48`). `ORIGIN` is a build argument, so a changed VM address needs a rebuild, or Refresh is refused as cross-site (`deploy/compose.yaml:8-10`, `deploy/proxmox/README.md:55`, ADR-014).

## Tests that still run

`deploy/proxmox/test.sh` runs at the end of `just check` (`justfile:28`): shellcheck when installed, the vendor-data, the dry-run `qm` commands, and `ninjagoldfinch-update` against a throwaway git repository with a fake `docker`, including following a moved tag and pruning a deleted one. It cannot exercise Proxmox or Docker (`deploy/proxmox/README.md:96-98`, `deploy/proxmox/test.sh:51-88`). It prints `deploy test: ok` (observed 2026-10-20). It unsets the location variables git exports to hooks before running git, so it is safe from a hook in a linked worktree (RV-01).

## Differences from production

| Aspect           | Preview VM                                                  | Production                                |
| ---------------- | ----------------------------------------------------------- | ----------------------------------------- |
| Runtime          | Docker container, `node:22-alpine`                          | `node build` under systemd, Ubuntu's Node |
| Reached by       | `http://<vm-ip>:3000` on the LAN                            | Cloudflare Tunnel to `127.0.0.1:3000`     |
| Build            | On the VM, inside `docker build`                            | On the host, in the checkout              |
| Settings         | `/opt/ninjagoldfinch/deploy/.env`                           | `/etc/ninjagoldfinch-lol/env`             |
| Deploy command   | `ninjagoldfinch-update [ref]`                               | the five commands in `README.md:104-112`  |
| Key name in docs | a placeholder, `<key-name>` (`deploy/proxmox/README.md:57`) | `ninjagoldfinch-lol-prod` (owner)         |

`just image` builds the same image locally as `ninjagoldfinch-web:local` (`justfile:38-40`).

---

**Sources:** `deploy/proxmox/README.md:L1-L98`, `deploy/proxmox/create-vm.sh:L1-L38` and `--help`, `deploy/proxmox/ninjagoldfinch-update:L1-L48`, `deploy/proxmox/test.sh:L1-L88`, `deploy/compose.yaml:L1-L14`, `Dockerfile:L1-L23`, `justfile:L28,L38-L40`, `docs/DECISIONS.md:L113-L127,L175,L500-L516`, `README.md:L104-L112`, owner answer 2026-10-19
**Last verified:** 2026-11-03 against commit `fbba06d`
