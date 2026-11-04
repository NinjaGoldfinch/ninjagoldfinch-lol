#!/usr/bin/env bash
# The one gate (`just check`, the pre-push hook and CI all run this): format,
# spec drift, lint, svelte-check, unit tests, build, deploy test, release package
# test. ADR-050, ADR-052.
set -euo pipefail
cd "$(dirname "$0")/.."

pnpm prettier --check .
pnpm openapi-typescript openapi/riot-proxy.json -o src/lib/api/schema.d.ts --check
pnpm eslint .
pnpm svelte-kit sync
pnpm svelte-check --tsconfig ./tsconfig.json
pnpm vitest run
pnpm build
bash deploy/proxmox/test.sh
bash scripts/package.test.sh
