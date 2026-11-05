#!/usr/bin/env bash
# Checks scripts/package.sh (ADR-052, ADR-057) and scripts/smoke.sh (ADR-060):
# package.sh refuses a tag that is not package.json's version, and each tarball
# it makes runs on its own, unpacked away from the checkout with no node_modules:
# /healthz and /api/version answer with that version (/api/version also with the
# commit), /api/status answers a local request and refuses Cloudflare's without
# a token, a start after another release sends a deployed event to EVENTS_URL,
# the smoke test passes against the mock riot-proxy, and a form post is accepted
# from the tarball's own origin and refused from the other's.
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
prod=https://ninjagoldfinch.lol
staging=https://staging.ninjagoldfinch.lol

for tag in "v9.9.9" "$version" "v$version;id" ""; do
	scripts/package.sh "$tag" "$tmp/refused" 2>/dev/null && fail "accepted tag '$tag'"
done
[ ! -e "$tmp/refused" ] || fail "a refused tag left output behind"

scripts/package.sh "v$version" "$tmp/dist" >/dev/null 2>&1 || fail "packaging v$version failed"
[ "$(cut -d' ' -f3 "$tmp/dist/SHA256SUMS")" = "$(printf '%s\n' ninjagoldfinch-lol.tar.gz ninjagoldfinch-lol-staging.tar.gz)" ] ||
	fail "SHA256SUMS must list the prod then the staging tarball: $(cat "$tmp/dist/SHA256SUMS")"
(cd "$tmp/dist" && sha256sum --strict --quiet -c SHA256SUMS) || fail "SHA256SUMS does not match"

proxy_port=$(free_port)
node tests/mock-proxy/server.ts "$proxy_port" >/dev/null &
pids+=($!)

# <asset> <its origin> <the other origin>
check() {
	local asset=$1 origin=$2 other=$3 release port body status
	[ "$(tar -tzf "$tmp/dist/$asset.tar.gz" | cut -d/ -f1 | sort -u)" = ninjagoldfinch-lol ] ||
		fail "$asset: the tarball must hold one top-level directory"
	release=$tmp/$asset
	mkdir "$release"
	tar -xzf "$tmp/dist/$asset.tar.gz" -C "$release" --strip-components=1
	grep -Eqx "\{\"version\":\"v$version\",\"commit\":\"[0-9a-f]{40}\",\"built_at\":\"[0-9T:-]+Z\"\}" \
		"$release/version.json" || fail "$asset: bad version.json: $(cat "$release/version.json")"
	[ ! -e "$release/node_modules" ] || fail "$asset: the release must not carry node_modules"

	# The previous start ran another release, so this start is a deploy (ADR-063).
	mkdir "$tmp/$asset-state"
	printf '{"version":"0.0.1","commit":"0000000"}\n' >"$tmp/$asset-state/last-version.json"
	events_port=$(free_port)
	node -e 'require("node:http").createServer((q, s) => { let b = ""; q.on("data", (c) => (b += c));
		q.on("end", () => { require("node:fs").appendFileSync(process.argv[2], b + "\n"); s.writeHead(204).end(); });
		}).listen(Number(process.argv[1]), "127.0.0.1")' "$events_port" "$tmp/$asset-events" &
	pids+=($!)

	port=$(free_port)
	(cd "$tmp" && env -i PATH="$PATH" NODE_ENV=production PORT="$port" \
		PROXY_URL="http://127.0.0.1:$proxy_port" PROXY_KEY=package-test-placeholder \
		CDRAGON_URL="http://127.0.0.1:$proxy_port" EVENTS_URL="http://127.0.0.1:$events_port/events" \
		STATE_DIRECTORY="$tmp/$asset-state" node "$release/build" >"$tmp/$asset.log" 2>&1) &
	pids+=($!)

	body=''
	for _ in $(seq 50); do
		body=$(curl -fsS --max-time 2 "http://127.0.0.1:$port/healthz" 2>/dev/null) && break
		sleep 0.2
	done
	[ "$body" = "{\"ok\":true,\"version\":\"$version\"}" ] ||
		fail "$asset: /healthz answered '$body'; server log: $(cat "$tmp/$asset.log")"
	# The build's identity is baked in (ADR-061): the release and its commit, not `dev`.
	body=$(curl -fsS --max-time 2 "http://127.0.0.1:$port/api/version")
	[ "$body" = "{\"version\":\"$version\",\"commit\":\"$(git rev-parse --short=7 HEAD)\"}" ] ||
		fail "$asset: /api/version answered '$body'"
	grep -q "ninjagoldfinch-lol $version commit " "$tmp/$asset.log" ||
		fail "$asset: no build identity in the start-up log: $(cat "$tmp/$asset.log")"
	# /api/status (ADR-062): a request on the host itself needs no token, and its
	# riot_proxy check reaches the mock riot-proxy in the background; one through
	# Cloudflare is refused without the token.
	for _ in $(seq 25); do
		body=$(curl -fsS --max-time 2 "http://127.0.0.1:$port/api/status")
		printf '%s' "$body" | grep -q '"name":"riot_proxy","status":"ok"' && break
		sleep 0.2
	done
	printf '%s' "$body" | grep -q '"name":"riot_proxy","status":"ok"' ||
		fail "$asset: /api/status never saw riot-proxy ok: $body"
	printf '%s' "$body" | grep -q "\"service\":\"ninjagoldfinch-lol\",\"host\":\"[^\"]*\",\"version\":\"$version\"" ||
		fail "$asset: /api/status does not report the release: $body"
	status=$(curl -s -o /dev/null -w '%{http_code}' -H 'Cf-Connecting-Ip: 198.51.100.7' \
		"http://127.0.0.1:$port/api/status")
	[ "$status" = 401 ] || fail "$asset: /api/status through Cloudflare without a token answered $status"
	# Events (ADR-063): the start was a deploy, recorded for the next start.
	for _ in $(seq 25); do
		grep -q '"event":"deployed"' "$tmp/$asset-events" 2>/dev/null && break
		sleep 0.2
	done
	grep -q "\"service\":\"ninjagoldfinch-lol\",.*\"event\":\"deployed\",\"severity\":\"info\",.*\"detail\":{\"from\":\"0.0.1\",\"to\":\"$version\"}" \
		"$tmp/$asset-events" 2>/dev/null ||
		fail "$asset: no deployed event: $(cat "$tmp/$asset-events" 2>/dev/null); server log: $(cat "$tmp/$asset.log")"
	grep -q "\"version\":\"$version\"" "$tmp/$asset-state/last-version.json" ||
		fail "$asset: the start did not record its version"
	! grep -q '"event":"proxy_' "$tmp/$asset-events" || fail "$asset: a proxy event with riot-proxy up"
	# The smoke test deploy.yml runs on staging (ADR-060), with a stand-in Access token.
	CF_ACCESS_CLIENT_ID=package-test CF_ACCESS_CLIENT_SECRET=package-test \
		scripts/smoke.sh "http://127.0.0.1:$port" "v$version" >/dev/null ||
		fail "$asset: the smoke test failed; server log: $(cat "$tmp/$asset.log")"
	scripts/smoke.sh "http://127.0.0.1:$port" v0.0.0-wrong >/dev/null 2>&1 &&
		fail "$asset: the smoke test passed with the wrong version"

	# The origin is fixed at build time (ADR-014): SvelteKit refuses a form post from any other.
	post() {
		curl -s -o /dev/null -w '%{http_code}' -X POST -H "Origin: $1" \
			-H 'Content-Type: application/x-www-form-urlencoded' --data '' \
			"http://127.0.0.1:$port/summoner/NinjaGoldfinch-OCENZ?/refresh"
	}
	status=$(post "$origin")
	[ "$status" != 403 ] || fail "$asset: a form post from $origin was refused"
	status=$(post "$other")
	[ "$status" = 403 ] || fail "$asset: a form post from $other answered $status, not 403"
}

check ninjagoldfinch-lol "$prod" "$staging"
check ninjagoldfinch-lol-staging "$staging" "$prod"

echo "package test: ok"
