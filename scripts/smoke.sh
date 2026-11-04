#!/usr/bin/env bash
# Smoke test of a running site (ADR-060): /healthz reports the expected version,
# the main pages answer 200 with the CSP, and a profile and a match render from
# riot-proxy. deploy.yml runs it against staging after each staging deploy, and
# its result decides whether that version may go to prod. The package test runs
# it against each tarball and the mock riot-proxy.
#
#   scripts/smoke.sh <base-url> <version>
#
# With CF_ACCESS_CLIENT_ID and CF_ACCESS_CLIENT_SECRET set, every request sends
# them as a Cloudflare Access service token, read from a file so they never
# appear in a command line.
set -euo pipefail

base=${1:-}
version=${2:-}
if [ -z "$base" ] || [ -z "$version" ]; then
	echo "usage: scripts/smoke.sh <base-url> <version>" >&2
	exit 2
fi
base=${base%/}
version=${version#v}

# A real profile and match: the owner's, also in tests/fixtures.
pages=(/ /about /champions /champions/ahri /summoner/NinjaGoldfinch-OCENZ /match/OC1_712351051)

tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT
fail() { echo "smoke: $*" >&2; exit 1; }

curl_args=(-sS --max-time 20)
if [ -n "${CF_ACCESS_CLIENT_ID:-}" ] || [ -n "${CF_ACCESS_CLIENT_SECRET:-}" ]; then
	[ -n "${CF_ACCESS_CLIENT_ID:-}" ] && [ -n "${CF_ACCESS_CLIENT_SECRET:-}" ] ||
		fail "set both CF_ACCESS_CLIENT_ID and CF_ACCESS_CLIENT_SECRET, or neither"
	(
		umask 077
		printf 'CF-Access-Client-Id: %s\nCF-Access-Client-Secret: %s\n' \
			"$CF_ACCESS_CLIENT_ID" "$CF_ACCESS_CLIENT_SECRET" > "$tmp/access"
	)
	curl_args+=(-H "@$tmp/access")
fi

# <path>: prints the status; the body goes to $tmp/body, the headers to $tmp/headers.
# A page that fails is tried up to three times, so one slow riot-proxy call
# doesn't fail the deploy.
get() {
	local status='' attempt
	for attempt in 1 2 3; do
		status=$(curl "${curl_args[@]}" -o "$tmp/body" -D "$tmp/headers" -w '%{http_code}' \
			"$base$1" 2>"$tmp/error") || status=000
		[ "$status" = 200 ] && break
		[ "$attempt" = 3 ] || sleep 3
	done
	echo "$status"
}

status=$(get /healthz)
if [ "$status" != 200 ]; then
	case $status in
	3*) fail "/healthz answered $status, a redirect: Cloudflare Access refused the request; check the service token" ;;
	*) fail "/healthz answered $status $(cat "$tmp/error")" ;;
	esac
fi
want="{\"ok\":true,\"version\":\"$version\"}"
[ "$(cat "$tmp/body")" = "$want" ] || fail "/healthz answered $(cat "$tmp/body"), not $want"
echo "smoke: ok /healthz $version"

for page in "${pages[@]}"; do
	status=$(get "$page")
	[ "$status" = 200 ] || fail "$page answered $status"
	grep -qi '^content-security-policy:' "$tmp/headers" || fail "$page has no Content-Security-Policy"
	echo "smoke: ok $page"
done

echo "smoke: $base passed at $version"
