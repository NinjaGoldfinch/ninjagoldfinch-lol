#!/usr/bin/env bash
# Checks scripts/package.sh (ADR-052): it refuses a tag that is not package.json's
# version, and the tarball it makes runs on its own, unpacked away from the
# checkout with no node_modules, answering /healthz with that version and serving
# a page from the mock riot-proxy.
set -euo pipefail
cd "$(dirname "$0")/.."

tmp=$(mktemp -d)
pids=()
cleanup() {
	for pid in "${pids[@]}"; do kill "$pid" 2>/dev/null || true; done
	rm -rf "$tmp"
}
trap cleanup EXIT
fail() { echo "package test: $*" >&2; exit 1; }
free_port() { node -e 'const s = require("node:net").createServer().listen(0, () => { console.log(s.address().port); s.close(); })'; }

version=$(node -p 'require("./package.json").version')

for tag in "v9.9.9" "$version" "v$version;id" ""; do
	scripts/package.sh "$tag" "$tmp/refused" 2>/dev/null && fail "accepted tag '$tag'"
done
[ ! -e "$tmp/refused" ] || fail "a refused tag left output behind"

scripts/package.sh "v$version" "$tmp/dist" >/dev/null 2>&1 || fail "packaging v$version failed"
(cd "$tmp/dist" && sha256sum --strict --quiet -c SHA256SUMS) || fail "SHA256SUMS does not match"
[ "$(tar -tzf "$tmp/dist/ninjagoldfinch-lol.tar.gz" | cut -d/ -f1 | sort -u)" = ninjagoldfinch-lol ] ||
	fail "the tarball must hold one top-level directory"

mkdir "$tmp/release"
tar -xzf "$tmp/dist/ninjagoldfinch-lol.tar.gz" -C "$tmp/release" --strip-components=1
release=$tmp/release
grep -Eqx "\{\"version\":\"v$version\",\"commit\":\"[0-9a-f]{40}\",\"built_at\":\"[0-9T:-]+Z\"\}" \
	"$release/version.json" || fail "bad version.json: $(cat "$release/version.json")"
[ ! -e "$release/node_modules" ] || fail "the release must not carry node_modules"

proxy_port=$(free_port)
node tests/mock-proxy/server.ts "$proxy_port" >/dev/null &
pids+=($!)
site_port=$(free_port)
(cd "$tmp" && env -i PATH="$PATH" NODE_ENV=production PORT="$site_port" \
	PROXY_URL="http://127.0.0.1:$proxy_port" PROXY_KEY=package-test-placeholder \
	CDRAGON_URL="http://127.0.0.1:$proxy_port" node "$release/build" >"$tmp/site.log" 2>&1) &
pids+=($!)

body=''
for _ in $(seq 50); do
	body=$(curl -fsS --max-time 2 "http://127.0.0.1:$site_port/healthz" 2>/dev/null) && break
	sleep 0.2
done
[ "$body" = "{\"ok\":true,\"version\":\"$version\"}" ] ||
	fail "/healthz answered '$body'; server log: $(cat "$tmp/site.log")"
status=$(curl -s -o /dev/null -w '%{http_code}' "http://127.0.0.1:$site_port/champions")
[ "$status" = 200 ] || fail "/champions answered $status; server log: $(cat "$tmp/site.log")"

echo "package test: ok"
