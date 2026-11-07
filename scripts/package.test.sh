#!/usr/bin/env bash
# Checks scripts/package.sh (ADR-052, ADR-057) and scripts/smoke.sh (ADR-060):
# package.sh refuses a tag that is not package.json's version, and each tarball
# it makes runs on its own, unpacked away from the checkout with no node_modules:
# /healthz and /api/version answer with that version (/api/version also with the
# commit), /api/status answers a local request and refuses Cloudflare's without
# a token, a start after another release sends a deployed event to EVENTS_URL,
# the smoke test passes against the mock riot-proxy, and a form post is accepted
# from the tarball's own origin and refused from the other's. Then one tarball
# is started with riot-proxy unreachable: its third failed check sends
# proxy_unreachable, and a restart with riot-proxy back sends proxy_recovered.
# Beside it, one without EVENTS_URL goes through the same outage and records no
# alarm (ADR-064).
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
# A port nothing listens on, and not one already given out in this run: a
# server started in the background may not be listening on its port yet, and
# the kernel can pick the same port twice.
free_port() {
	local port
	while :; do
		port=$(node -e 'const s = require("node:net").createServer().listen(0, () => { console.log(s.address().port); s.close(); })')
		grep -qx "$port" "$tmp/ports" 2>/dev/null || break
	done
	echo "$port" | tee -a "$tmp/ports"
}

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

# <file>: starts a receiver for EVENTS_URL that appends each body it is sent to
# the file. Sets events_port.
receiver() {
	events_port=$(free_port)
	node -e 'require("node:http").createServer((q, s) => { let b = ""; q.on("data", (c) => (b += c));
		q.on("end", () => { require("node:fs").appendFileSync(process.argv[2], b + "\n"); s.writeHead(204).end(); });
		}).listen(Number(process.argv[1]), "127.0.0.1")' "$events_port" "$1" &
	pids+=($!)
}

# <release directory> <port> <log> [NAME=value ...]: starts a release's server
# away from the checkout, with only the environment given. Sets site_pid.
serve() {
	local release=$1 port=$2 log=$3
	shift 3
	(cd "$tmp" && exec env -i PATH="$PATH" NODE_ENV=production PORT="$port" \
		PROXY_KEY=package-test-placeholder CDRAGON_URL="http://127.0.0.1:$proxy_port" "$@" \
		node "$release/build" >"$log" 2>&1) &
	site_pid=$!
	pids+=("$site_pid")
}

# <file> <pattern> <tries>: waits, 0.2 s a try, for a line of the file to match.
await_line() {
	for _ in $(seq "$3"); do
		grep -q "$2" "$1" 2>/dev/null && return 0
		sleep 0.2
	done
	return 1
}

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
	receiver "$tmp/$asset-events"

	port=$(free_port)
	serve "$release" "$port" "$tmp/$asset.log" PROXY_URL="http://127.0.0.1:$proxy_port" \
		EVENTS_URL="http://127.0.0.1:$events_port/events" STATE_DIRECTORY="$tmp/$asset-state"

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
	await_line "$tmp/$asset-events" '"event":"deployed"' 25 || true
	grep -q "\"service\":\"ninjagoldfinch-lol\",.*\"event\":\"deployed\",\"severity\":\"info\",.*\"detail\":{\"from\":\"0.0.1\",\"to\":\"$version\"}" \
		"$tmp/$asset-events" 2>/dev/null ||
		fail "$asset: no deployed event: $(cat "$tmp/$asset-events" 2>/dev/null); server log: $(cat "$tmp/$asset.log")"
	grep -q "\"version\":\"$version\"" "$tmp/$asset-state/last-version.json" ||
		fail "$asset: the start did not record its version"
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

# Proxy events from real checks, through the init hook (ADR-063). With nothing
# on riot-proxy's port, the third failed check, 5 s apart, sends
# proxy_unreachable and records it. The server is then restarted with riot-proxy
# back, as a deploy during an outage would: its first check sends the
# proxy_recovered the outage is owed. A server without EVENTS_URL, started
# first on the same dead port, sees the same failed checks and must not write
# proxy-alarm.json (ADR-064), while it still records its version.
outage() {
	local release=$tmp/ninjagoldfinch-lol state=$tmp/outage-state events=$tmp/outage-events
	local log=$tmp/outage.log url port dead raised_at quiet=$tmp/outage-no-url-state
	receiver "$events"
	url=http://127.0.0.1:$events_port/events

	port=$(free_port)
	dead=$(free_port)
	serve "$release" "$(free_port)" "$log.no-url" PROXY_URL="http://127.0.0.1:$dead" \
		STATUS_CHECK_INTERVAL_S=5 STATE_DIRECTORY="$quiet"
	serve "$release" "$port" "$log" PROXY_URL="http://127.0.0.1:$dead" \
		STATUS_CHECK_INTERVAL_S=5 EVENTS_URL="$url" STATE_DIRECTORY="$state"
	await_line "$events" '"event":"proxy_unreachable"' 150 ||
		fail "no proxy_unreachable after three failed checks: $(cat "$events" 2>/dev/null); server log: $(cat "$log")"
	raised_at=$SECONDS
	grep -q '"service":"ninjagoldfinch-lol",.*"event":"proxy_unreachable","severity":"critical",.*"detail":{"reason":"unreachable"}' \
		"$events" || fail "bad proxy_unreachable event: $(cat "$events")"
	await_line "$state/proxy-alarm.json" '"raised":true' 25 ||
		fail "the raised alarm was not recorded: $(cat "$state/proxy-alarm.json" 2>/dev/null)"
	# The first start with nothing recorded is not a deploy.
	! grep -q '"event":"deployed"' "$events" || fail "a deployed event on a first start: $(cat "$events")"

	kill "$site_pid"
	wait "$site_pid" 2>/dev/null || true
	serve "$release" "$(free_port)" "$log.2" PROXY_URL="http://127.0.0.1:$proxy_port" \
		EVENTS_URL="$url" STATE_DIRECTORY="$state"
	await_line "$events" '"event":"proxy_recovered"' 75 ||
		fail "no proxy_recovered after a restart with riot-proxy back: $(cat "$events"); server log: $(cat "$log.2")"
	grep -q '"event":"proxy_recovered","severity":"info",.*"detail":{"reason":"ready"}' "$events" ||
		fail "bad proxy_recovered event: $(cat "$events")"
	await_line "$state/proxy-alarm.json" '"raised":false' 25 ||
		fail "the alarm was not cleared: $(cat "$state/proxy-alarm.json")"
	[ "$(grep -c '"event":"proxy_' "$events")" = 2 ] ||
		fail "an outage must send one proxy_unreachable and one proxy_recovered: $(cat "$events")"

	# By now the server without a URL has had at least one more check than the
	# one that raised the alarm: the raise, then a full interval.
	while ((SECONDS - raised_at < 6)); do sleep 0.2; done
	[ -e "$quiet/last-version.json" ] ||
		fail "the server without EVENTS_URL did not record its version; server log: $(cat "$log.no-url")"
	[ ! -e "$quiet/proxy-alarm.json" ] ||
		fail "the server without EVENTS_URL recorded an alarm: $(cat "$quiet/proxy-alarm.json")"
}
outage

echo "package test: ok"
