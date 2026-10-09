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

# The one gate: everything a pipeline would run
check:
    pnpm prettier --check .
    pnpm eslint .
    pnpm svelte-kit sync
    pnpm svelte-check --tsconfig ./tsconfig.json
    pnpm vitest run
    pnpm build

# Browser smoke tests against the mock proxy
e2e:
    pnpm playwright test

# Build the production image locally
image:
    docker build -t ninjagoldfinch-web:local .
