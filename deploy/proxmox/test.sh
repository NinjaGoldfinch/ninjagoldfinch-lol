#!/usr/bin/env bash
# Checks deploy/proxmox without Proxmox, Docker or GitHub: shellcheck (when
# installed), the generated vendor-data, the dry-run qm commands, and
# ninjagoldfinch-update against a throwaway repo with a fake docker.
set -euo pipefail

here=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT
fail() { echo "deploy test: $*" >&2; exit 1; }

if command -v shellcheck >/dev/null; then
  shellcheck "$here/create-vm.sh" "$here/ninjagoldfinch-update" "$here/test.sh"
else
  echo "deploy test: shellcheck not installed, skipped"
fi

# Vendor-data: valid header, the update script embedded byte for byte, GitHub's host keys.
vendor=$("$here/create-vm.sh" --print-vendor-data)
[[ $vendor == "#cloud-config"* ]] || fail "vendor-data must start with #cloud-config"
mapfile -t blobs < <(grep -o 'content: [A-Za-z0-9+/=]*' <<<"$vendor" | cut -d' ' -f2)
cmp -s <(base64 -d <<<"${blobs[0]}") "$here/ninjagoldfinch-update" || fail "embedded update script differs"
base64 -d <<<"${blobs[1]}" | grep -q '^github.com ssh-ed25519 ' || fail "GitHub host keys missing"

# Dry run: the qm commands and the printed next steps.
echo "ssh-ed25519 AAAA test" > "$tmp/key.pub"
out=$("$here/create-vm.sh" --dry-run --ssh-keys "$tmp/key.pub" --vmid 321 --ip 192.168.68.60/22 --gw 192.168.68.1)
for want in 'qm create 321 --name ninjagoldfinch-web ' \
  'cicustom vendor=local:snippets/ninjagoldfinch-web-321.yaml' \
  'ipconfig0 ip=192.168.68.60/22\,gw=192.168.68.1' \
  'http://192.168.68.60:3000'; do
  grep -qF -- "$want" <<<"$out" || fail "dry run is missing: $want"
done
if "$here/create-vm.sh" --dry-run >/dev/null 2>&1; then fail "--ssh-keys or --generate-key must be required"; fi

# --generate-key: a per-VM login key on the host, used for the VM's authorized keys.
out=$("$here/create-vm.sh" --dry-run --generate-key --vmid 321 --key-dir /root/.ssh/ngf-test)
for want in 'ssh-keygen -q -t ed25519' \
  '-f /root/.ssh/ngf-test/ninjagoldfinch-web-321' \
  'sshkeys /root/.ssh/ngf-test/ninjagoldfinch-web-321.pub' \
  'ssh -i /root/.ssh/ngf-test/ninjagoldfinch-web-321 web@<vm-ip>'; do
  grep -qF -- "$want" <<<"$out" || fail "--generate-key dry run is missing: $want"
done

# ninjagoldfinch-update against a throwaway repo, with fake docker and hostname.
git() { command git -c user.name=test -c user.email=test@example.com "$@"; }
mkdir -p "$tmp/src/deploy" "$tmp/site" "$tmp/bin"
printf 'PROXY_URL=http://proxy:8080\nPROXY_KEY=\nORIGIN=http://localhost:3000\n' > "$tmp/src/.env.example"
touch "$tmp/src/deploy/compose.yaml"
git -C "$tmp/src" init -q -b main
git -C "$tmp/src" add -A && git -C "$tmp/src" commit -qm one
first=$(git -C "$tmp/src" rev-parse HEAD)
git -C "$tmp/src" commit -q --allow-empty -m two && git -C "$tmp/src" tag -a -m v0.0.2 v0.0.2

cat > "$tmp/bin/docker" <<'FAKE'
#!/bin/sh
echo "docker $*" >> "$DOCKER_LOG"
FAKE
printf '#!/bin/sh\necho 10.0.0.5\n' > "$tmp/bin/hostname"
chmod +x "$tmp/bin/docker" "$tmp/bin/hostname"
export PATH="$tmp/bin:$PATH" DOCKER_LOG="$tmp/docker.log"
export NINJAGOLDFINCH_REPO="$tmp/src" NINJAGOLDFINCH_DIR="$tmp/site"
update="$here/ninjagoldfinch-update"

if "$update" >"$tmp/out" 2>&1; then fail "first run must stop until deploy/.env is filled in"; fi
grep -qx 'ORIGIN=http://10.0.0.5:3000' "$tmp/site/deploy/.env" || fail "ORIGIN not set to the VM address"
[ ! -e "$DOCKER_LOG" ] || fail "first run must not start the container"

"$update" >"$tmp/out" 2>&1 || { cat "$tmp/out"; fail "second run failed"; }
grep -qx 'docker compose -f deploy/compose.yaml up -d --build' "$DOCKER_LOG" || fail "container not rebuilt"
grep -q 'running v0.0.2 on http://10.0.0.5:3000' "$tmp/out" || fail "unexpected output: $(cat "$tmp/out")"

"$update" "$first" >/dev/null 2>&1 || fail "deploying a commit failed"
[ "$(git -C "$tmp/site" rev-parse HEAD)" = "$first" ] || fail "commit not checked out"

echo "deploy test: ok"
