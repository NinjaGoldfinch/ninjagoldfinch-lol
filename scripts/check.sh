#!/usr/bin/env bash
# The one gate (`just check`, the pre-push hook and CI all run this): format,
# progress ticks, spec drift, lint, svelte-check, unit tests, build, release
# package test. ADR-050, ADR-052, ADR-067, ADR-069.
set -euo pipefail
cd "$(dirname "$0")/.."

pnpm prettier --check .
node scripts/check-progress.ts
pnpm openapi-typescript openapi/riot-proxy.json -o src/lib/api/schema.d.ts --check
pnpm eslint .
pnpm svelte-kit sync
pnpm svelte-check --tsconfig ./tsconfig.json
pnpm vitest run
pnpm build
bash scripts/package.test.sh
