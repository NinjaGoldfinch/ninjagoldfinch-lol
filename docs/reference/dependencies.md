# Dependencies

Every third-party package ninjagoldfinch.lol uses, what it is for, the version installed at `e7c395c`, and how versions are pinned. The site has one runtime dependency; everything else builds, checks or tests it.

## How versions are pinned

- `package.json` declares caret ranges (`^x.y.z`); `pnpm-lock.yaml` pins exact versions, and every install uses `--frozen-lockfile`, so local, CI and production installs get identical trees (`README.md:109`).
- The package manager is pinned with `"packageManager": "pnpm@12.10.1"` (`package.json:6`). pnpm's own entry is kept out of the lockfile with `pmOnFail: ignore`, so GitHub's dependency graph (and Dependabot alerts) sees the app's packages; corepack, not pnpm, enforces the pin (ADR-005, `pnpm-workspace.yaml:3-7`). Production installs pnpm 12.10.1 with `npm install -g` and does not use corepack ([deployment/install.md](../deployment/install.md#2-pnpm)).
- Node is pinned by range, `>=22.18`, enforced by `engine-strict=true` (`package.json:7-9`, `.npmrc:1`).
- `allowBuilds: esbuild: true` lets esbuild's install script run; others are not allowed to (`pnpm-workspace.yaml:1-2`).
- A new runtime dependency needs the owner's agreement first (`CLAUDE.md:26-27`), and ADR-006 records the case for the one there is.

Version numbers below are those installed from the lockfile on 2026-10-20 (`node -p "require('./node_modules/<pkg>/package.json').version"`).

## Runtime

| Package         | Range     | Installed | Purpose                                                                                                                              | Notes                                                                                                                                                                                                            |
| --------------- | --------- | --------- | ------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `openapi-fetch` | `^0.17.0` | 0.17.0    | The typed riot-proxy client: path templates and parameters checked against the generated types (`src/lib/server/proxy.ts:2,144-150`) | ADR-006: about 6 kB, one dependency; replaces re-typing riot-proxy's paths by hand. Listed under `devDependencies` since ADR-052, so adapter-node bundles it into `build/` and a release needs no `node_modules` |

It and everything else, Svelte and SvelteKit included, is bundled into `build/` at build time: `package.json` has no `dependencies`, and adapter-node leaves only those outside the bundle. A release tarball therefore runs with no `node_modules` (ADR-052; `scripts/package.test.sh` checks it). Production still installs all dependencies while it builds on the host.

## Framework and build

| Package                        | Range     | Installed | Purpose                                                                             |
| ------------------------------ | --------- | --------- | ----------------------------------------------------------------------------------- |
| `@sveltejs/kit`                | `^3.0.0`  | 3.0.1     | The framework: routing, server loads, form actions, env handling (ADR-001, ADR-004) |
| `@sveltejs/adapter-node`       | `^6.0.0`  | 6.0.0     | Builds the standalone Node server run as `node build` (`vite.config.ts:3,15`)       |
| `svelte`                       | `^5.57.1` | 5.57.2    | Components, runes mode forced (`vite.config.ts:10-13`)                              |
| `@sveltejs/vite-plugin-svelte` | `^7.2.0`  | 7.3.1     | Svelte compilation in Vite                                                          |
| `vite`                         | `^8.3.0`  | 8.3.3     | Dev server and bundler                                                              |
| `tailwindcss`                  | `^4.3.0`  | 4.3.3     | Utility CSS with tokens in `src/app.css`                                            |
| `@tailwindcss/vite`            | `^4.3.0`  | 4.3.3     | Tailwind's Vite plugin (`vite.config.ts:1,8`)                                       |
| `typescript`                   | `^6.0.3`  | 6.0.3     | Type checking, strict (`tsconfig.json:4`)                                           |
| `@types/node`                  | `^22`     | 22.20.5   | Node types, matched to the Node 22 runtime                                          |

## API types

| Package              | Range     | Installed | Purpose                                                                                                                                                                                                                                 |
| -------------------- | --------- | --------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `openapi-typescript` | `^7.13.0` | 7.13.0    | Generates `src/lib/api/schema.d.ts` from `openapi/riot-proxy.json` (`just gen`); `just check` fails on drift (`justfile:15-22`). It declares a `typescript ^5` peer but works with 6, so `pnpm-workspace.yaml:8-12` allows it (ADR-006) |

## Lint, format and checks

| Package                       | Range     | Installed | Purpose                                              |
| ----------------------------- | --------- | --------- | ---------------------------------------------------- |
| `eslint`                      | `^10.4.1` | 10.12.0   | Linting (`eslint.config.js`)                         |
| `@eslint/js`                  | `^10.0.1` | 10.0.1    | ESLint's recommended rules                           |
| `typescript-eslint`           | `^8.60.1` | 8.71.1    | TypeScript rules and parser                          |
| `eslint-plugin-svelte`        | `^3.19.0` | 3.23.0    | Svelte rules                                         |
| `eslint-config-prettier`      | `^10.1.8` | 10.1.8    | Turns off rules that conflict with Prettier          |
| `globals`                     | `^17.6.0` | 17.13.0   | Browser and Node globals for ESLint                  |
| `prettier`                    | `^3.8.3`  | 3.9.9     | Formatting, code and Markdown (`prettier.config.js`) |
| `prettier-plugin-svelte`      | `^4.1.0`  | 4.1.1     | Formats `.svelte` files                              |
| `prettier-plugin-tailwindcss` | `^0.8.0`  | 0.8.1     | Sorts Tailwind classes                               |
| `svelte-check`                | `^4.6.0`  | 4.7.6     | Type-checks Svelte components (`justfile:25`)        |

## Tests

| Package            | Range     | Installed | Purpose                                                                                                                                    |
| ------------------ | --------- | --------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| `vitest`           | `^4.1.8`  | 4.1.11    | Unit tests (`vite.config.ts:22-37`)                                                                                                        |
| `@playwright/test` | `^1.60.0` | 1.64.0    | Browser tests against `node build` and the mock proxy (`playwright.config.ts`); needs Chromium and its system packages (`README.md:16-17`) |

## Tools outside `package.json`

| Tool                      | Version seen                                               | Used for                                                |
| ------------------------- | ---------------------------------------------------------- | ------------------------------------------------------- |
| Node                      | 22.23.3 (development), Ubuntu 26.04's package (production) | Runtime and tooling                                     |
| pnpm                      | 12.10.1                                                    | Package manager                                         |
| just                      | 1.58.0                                                     | Task runner (`justfile`)                                |
| riot-proxy release binary | 2.7.0                                                      | Source of `openapi/riot-proxy.json` (`README.md:56-65`) |

## Updating dependencies

There is no Dependabot configuration, so updates are ordinary tasks (CI runs the gate on their pull request, ADR-050): change the range or run `pnpm update <pkg>`, commit `package.json` and `pnpm-lock.yaml`, and pass `just check` and `just e2e`. Record a reason in `docs/DECISIONS.md` when a pin or peer override changes (as ADR-005 and ADR-006 do).

---

**Sources:** `package.json:L6-L50`, `pnpm-workspace.yaml:L1-L12`, `.npmrc:L1`, `vite.config.ts:L1-L37`, `justfile:L15-L25`, `tsconfig.json:L4`, `README.md:L16-L17,L56-L65,L109`, `CLAUDE.md:L26-L27`, `docs/DECISIONS.md:L5-L79` (ADR-001, ADR-004, ADR-005, ADR-006), `node_modules/*/package.json` (installed versions), `build/server/chunks/static-data.js` (runtime import)
**Last verified:** 2026-11-03 against commit `2658c48`
