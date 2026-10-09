# List recipes
default:
    @just --list

# First run on a new machine: install, enable git hooks, create .env
setup:
    pnpm install
    git config core.hooksPath .githooks
    [ -f .env ] || cp .env.example .env

# Dev server with hot reload
dev:
    pnpm dev

# Regenerate API types from the committed spec
gen:
    pnpm openapi-typescript openapi/riot-proxy.json -o src/lib/api/schema.d.ts

# The one gate: everything a pipeline would run
check:
    pnpm prettier --check .
    pnpm openapi-typescript openapi/riot-proxy.json -o src/lib/api/schema.d.ts --check
    pnpm eslint .
    pnpm svelte-kit sync
    pnpm svelte-check --tsconfig ./tsconfig.json
    pnpm vitest run
    pnpm build
    bash deploy/proxmox/test.sh

# Browser smoke tests against the mock proxy
e2e:
    pnpm playwright test

# Record one riot-proxy response as a test fixture (spends Riot rate limit)
fixture name path:
    node tests/record-fixture.ts {{name}} '{{path}}'

# Build the production image locally
image:
    docker build -t ninjagoldfinch-web:local .
