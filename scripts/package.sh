#!/usr/bin/env bash
# Builds a release for ninja-deploy (ADR-052): <out>/ninjagoldfinch-lol.tar.gz, one
# top-level directory holding the built server (build/), package.json, LICENSE and
# version.json, and <out>/SHA256SUMS. The release workflow runs it for a v* tag.
#
#   scripts/package.sh <tag> [out-dir]
#
# The tag must be package.json's version with a leading v: /healthz reports that
# version, and a deploy waits for it to match the tag (ADR-051). The build goes to a
# temporary directory, so the checkout's build/ is left alone. ORIGIN defaults to
# production's; it is fixed at build time (ADR-014).
set -euo pipefail
cd "$(dirname "$0")/.."

tag=${1:-}
out=${2:-dist}
name=ninjagoldfinch-lol

if ! printf '%s' "$tag" | grep -Eqx 'v[0-9]+\.[0-9]+\.[0-9]+(-[0-9A-Za-z.]+)?'; then
	echo "package: bad tag '$tag' (want one such as v1.2.3)" >&2
	exit 1
fi
version=$(node -p 'require("./package.json").version')
if [ "$tag" != "v$version" ]; then
	echo "package: tag $tag does not match package.json's version $version (ADR-051)" >&2
	exit 1
fi

work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT
stage=$work/$name
mkdir "$stage"

BUILD_OUT="$stage/build" ORIGIN="${ORIGIN:-https://ninjagoldfinch.lol}" pnpm build
cp package.json LICENSE "$stage/"
printf '{"version":"%s","commit":"%s","built_at":"%s"}\n' \
	"$tag" "$(git rev-parse HEAD)" "$(date -u +%Y-%m-%dT%H:%M:%SZ)" > "$stage/version.json"

mkdir -p "$out"
tar -czf "$out/$name.tar.gz" -C "$work" "$name"
(cd "$out" && sha256sum "$name.tar.gz" > SHA256SUMS)
echo "package: $out/$name.tar.gz ($tag)"
