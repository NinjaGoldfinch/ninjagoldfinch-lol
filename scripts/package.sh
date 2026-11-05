#!/usr/bin/env bash
# Builds a release for ninja-deploy (ADR-052, ADR-057): one tarball per
# environment, each holding one top-level directory with the built server
# (build/), package.json, LICENSE and version.json, and SHA256SUMS listing both.
# The release workflow runs it for a v* tag.
#
#   scripts/package.sh <tag> [out-dir]
#
#   ninjagoldfinch-lol.tar.gz          prod, built for https://ninjagoldfinch.lol
#   ninjagoldfinch-lol-staging.tar.gz  staging, built for https://staging.ninjagoldfinch.lol
#
# The origin is fixed at build time (ADR-014), hence one build per environment;
# the code and version are the same. The tag must be package.json's version with
# a leading v: /healthz reports that version, and a deploy waits for it to match
# the tag (ADR-051). Builds go to a temporary directory, so the checkout's build/
# is left alone.
set -euo pipefail
cd "$(dirname "$0")/.."

tag=${1:-}
out=${2:-dist}
name=ninjagoldfinch-lol

# <asset name> <origin>
targets=(
	"$name https://ninjagoldfinch.lol"
	"$name-staging https://staging.ninjagoldfinch.lol"
)

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
commit=$(git rev-parse HEAD)
built_at=$(date -u +%Y-%m-%dT%H:%M:%SZ)
mkdir -p "$out"
assets=()

for target in "${targets[@]}"; do
	read -r asset origin <<<"$target"
	stage=$work/$asset/$name
	mkdir -p "$stage"
	BUILD_OUT="$stage/build" ORIGIN="$origin" BUILD_VERSION="$version" \
		BUILD_COMMIT="${commit:0:7}" BUILD_TIME="$built_at" pnpm build
	cp package.json LICENSE "$stage/"
	printf '{"version":"%s","commit":"%s","built_at":"%s"}\n' \
		"$tag" "$commit" "$built_at" > "$stage/version.json"
	tar -czf "$out/$asset.tar.gz" -C "$work/$asset" "$name"
	assets+=("$asset.tar.gz")
	echo "package: $out/$asset.tar.gz ($tag, $origin)"
done

(cd "$out" && sha256sum "${assets[@]}" > SHA256SUMS)
