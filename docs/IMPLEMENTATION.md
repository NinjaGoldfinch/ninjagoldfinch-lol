# ninjagoldfinch.lol — Implementation Plan

Oct 9, 2026 · @Sam

## Overview and scope

ninjagoldfinch.lol is a server-rendered SvelteKit site that sits in front of riot-proxy and shows League of Legends player and champion stats. riot-proxy stays the only thing that talks to Riot; the site is the only thing that talks to riot-proxy.

**In scope for v1**

- Player search by Riot ID, profile page with rank and match history, match detail with timeline.
- Champion analytics pages, using what riot-proxy already serves.
- A private repo, a local dev loop, and a deploy you run by hand on the existing Proxmox host.

**Out of scope for now**

- CI/CD. No GitHub Actions workflows. The repo exposes one `just check` command that a pipeline of your own can call later.
- Accounts, Riot Sign On, monetisation, and anything that needs a database in the frontend.
- Changes to riot-proxy. Gaps found while building are raised as issues there, not patched around here.

**Design goals, in priority order:** small, working, easy to maintain. When they conflict, pick the option with fewer dependencies and fewer moving parts.

## Architecture

A request crosses Cloudflare and a tunnel before it reaches the SvelteKit server, which is the only component that can call riot-proxy.

```text
Browser
  │  HTTPS
  ▼
Cloudflare (DNS, cache, rate limits)
  │  Tunnel
  ▼
cloudflared  ─────────────────────────────── Proxmox VM ──┐
  │  http://web:3000                                       │
  ▼                                                        │
SvelteKit server (web)          holds PROXY_KEY            │
  │  Bearer rpx_...  http://riot-proxy:8080                │
  ▼                                                        │
riot-proxy                      holds RIOT_API_KEY         │
  │  ───────────────────────────────────────────────────── ┘
  │  HTTPS
  ▼
Riot API
```

Each secret lives in exactly one place: `PROXY_KEY` in the web container, `RIOT_API_KEY` in riot-proxy. riot-proxy's `/dashboard`, `/docs` and `/v1/admin/*` are reachable only from inside the VM or over the LAN.

**Why a server at all:** riot-proxy authenticates callers with a bearer key, so the browser cannot call it directly. The SvelteKit server adds no API of its own; pages load data in `+page.server.ts` and return HTML.

## Stack and versions

Start on the stable SvelteKit 2.x line. SvelteKit 3 was still in pre-release in August 2026; check its status before scaffolding and take 3.x only if it is stable.

| Layer | Choice | Notes |
| --- | --- | --- |
| Runtime | Node 22 LTS | Required by SvelteKit 3, so it avoids a second upgrade later |
| Package manager | pnpm | Pin with `packageManager` in `package.json` |
| Framework | SvelteKit 2.x, Svelte 5, TypeScript strict | Runes only; no Svelte 4 syntax |
| Adapter | `@sveltejs/adapter-node` | Plain Node server in a container |
| Data loading | `+page.server.ts` and `+server.ts` | No remote functions until they leave experimental |
| API client | `openapi-typescript` (dev) + `openapi-fetch` | Types generated from riot-proxy's OpenAPI spec |
| Styling | Tailwind CSS v4 | Design tokens in one `app.css`; no component kit yet |
| Charts | Hand-written SVG components | Add uPlot or LayerChart only when a timeline chart needs it |
| Unit tests | Vitest | Data-shaping functions and the proxy client wrapper |
| Browser tests | Playwright | A handful of smoke tests against a mock proxy |
| Lint and format | ESLint + Prettier with the Svelte plugins | Installed by the `sv` scaffolder |
| Task runner | `just` | Same as riot-proxy |
| Reverse proxy | Caddy | Only if you open ports instead of using the Tunnel |
| Edge | Cloudflare DNS, cache and Tunnel | No inbound ports on the home network |

**Dependency rule:** a new runtime dependency needs a line in `docs/DECISIONS.md` saying why hand-written code was not enough.

## Private repo setup

The repo is private from the first commit, and guard rails run locally because nothing runs on GitHub.

**Create it**

```bash
mkdir ninjagoldfinch-lol && cd ninjagoldfinch-lol
git init -b main
# scaffold first (next section), then:
gh repo create NinjaGoldfinch/ninjagoldfinch-lol --private --source=. --remote=origin
git push -u origin main
```

**Settings to change once, in the GitHub UI**

- Actions: disable for this repository (Settings, Actions, General). Nothing can run or bill by accident.
- Pull requests: allow squash merging only, and delete head branches on merge.
- Features: turn off Wiki, Projects and Discussions. Keep Issues.
- Dependabot alerts: on. Alerts are free on private repos; leave automated update PRs off for now.

**Branch rules**

GitHub does not enforce branch protection on private repos on the free personal plan, as far as I know, so the rule is a convention backed by a local hook: never commit to `main`, one task per branch, squash-merge through a PR. Confirm the plan limits in the repo's Branches settings; if protection is available, require a PR for `main`.

**Local hooks instead of CI**

Hooks live in the repo under `.githooks/` and are enabled with `git config core.hooksPath .githooks`, which `just setup` runs.

| Hook | Does | Why |
| --- | --- | --- |
| `pre-commit` | Refuses staged content matching `rpx_` or `RGAPI-`, and refuses commits on `main` | Keys never reach the remote; `main` only moves by merge |
| `pre-push` | Runs `just check` | Stands in for CI until your own pipeline exists |

**Files that keep secrets out**

- `.gitignore`: `node_modules`, `.svelte-kit`, `build`, `.env`, `.env.*`, with `!.env.example` to keep the example.
- `.dockerignore`: the same list plus `.git` and `tests`.
- `.env.example`: every variable with a placeholder value and a one-line comment.

**Access from the server**

Add a read-only deploy key for the VM (Settings, Deploy keys) so it can `git pull` the private repo without your personal credentials. Generate the keypair on the VM; do not reuse the riot-proxy one.

## Scaffold and project layout

Use the official `sv` scaffolder and pick the options interactively; flag names change between releases, so the prompts are the reliable path.

```bash
pnpm dlx sv create .
#   template:  SvelteKit minimal
#   types:     TypeScript
#   add-ons:   prettier, eslint, vitest, playwright, tailwindcss, sveltekit-adapter (node)
pnpm add openapi-fetch
pnpm add -D openapi-typescript
```

**Layout**

```text
.
├── CLAUDE.md
├── README.md
├── justfile
├── Dockerfile
├── .env.example
├── .githooks/               pre-commit, pre-push
├── docs/
│   ├── IMPLEMENTATION.md    this plan, exported
│   ├── DECISIONS.md         ADR-nnn entries
│   └── PROGRESS.md          task ticks
├── deploy/
│   ├── compose.yaml         web + cloudflared (+ riot-proxy)
│   └── Caddyfile
├── openapi/
│   └── riot-proxy.json      committed copy of the proxy's spec
├── src/
│   ├── app.css              Tailwind import and design tokens
│   ├── app.html
│   ├── hooks.server.ts      request id, security headers, error mapping
│   ├── lib/
│   │   ├── server/          never imported by client code
│   │   │   ├── proxy.ts     the one openapi-fetch client
│   │   │   ├── env.ts       validated private env
│   │   │   └── cache.ts     Cache-Control helpers
│   │   ├── api/             generated types (schema.d.ts)
│   │   ├── domain/          pure functions: KDA, queue names, patch parsing
│   │   ├── components/      MatchRow, RankBadge, ChampionIcon, StatBar
│   │   └── assets.ts        Data Dragon and CommunityDragon URL builders
│   └── routes/              see Routes and pages
└── tests/
    ├── unit/                Vitest
    ├── e2e/                 Playwright
    └── fixtures/            redacted proxy responses
```

Two rules keep this maintainable. Everything that touches the proxy key lives under `src/lib/server/`, which SvelteKit refuses to bundle into client code. Everything in `src/lib/domain/` is a pure function with a unit test, so page files stay thin.

## Configuration and secrets

The site holds one secret, its riot-proxy consumer key, and reads it only on the server.

| Variable | Example | Meaning |
| --- | --- | --- |
| `PROXY_URL` | `http://riot-proxy:8080` | Base URL of riot-proxy on the private network |
| `PROXY_KEY` | `rpx_...` | Read-scope consumer key. Secret |
| `ORIGIN` | `https://ninjagoldfinch.lol` | Needed by adapter-node for correct URLs and form checks |
| `PORT` | `3000` | Listen port inside the container |
| `PUBLIC_SITE_NAME` | `ninjagoldfinch.lol` | The only client-visible variable |

**Mint the key on the riot-proxy host**

```bash
./riot-proxy key create --name ninjagoldfinch-web     # read scope is the default
```

Use a separate key for local development (`--name ninjagoldfinch-dev`) so either can be revoked alone.

**Rules**

- Import secrets from `$env/dynamic/private` inside `src/lib/server/env.ts` and nowhere else. That file throws at start-up if a variable is missing.
- Never prefix a secret with `PUBLIC_`. SvelteKit ships `PUBLIC_` values to the browser.
- `.env` exists only on your machine and on the VM. It is never committed and never baked into the image.
- The site never holds the Riot API key or a riot-proxy admin key.

## riot-proxy integration

All proxy access goes through one typed client in `src/lib/server/proxy.ts`, generated from riot-proxy's own OpenAPI spec.

**Typed client**

1. Save the spec that backs riot-proxy's `/docs` page to `openapi/riot-proxy.json`. Open question: the exact JSON URL; note it in the README once found.
2. `just gen` runs `openapi-typescript openapi/riot-proxy.json -o src/lib/api/schema.d.ts`.
3. Commit both files. A proxy change then shows up as a diff and as type errors, not as a runtime surprise.

```ts
// src/lib/server/proxy.ts
import createClient from 'openapi-fetch';
import type { paths } from '$lib/api/schema';
import { env } from './env';

export const proxy = createClient<paths>({
  baseUrl: env.PROXY_URL,
  headers: { Authorization: `Bearer ${env.PROXY_KEY}` }
});
```

```ts
// src/routes/summoner/[riotId]/+page.server.ts (shape only)
export const load = async ({ params, setHeaders }) => {
  const [gameName, tagLine] = parseRiotId(params.riotId);
  const { data, error: apiError, response } = await proxy.GET(
    '/v1/riot/accounts/by-riot-id/{gameName}/{tagLine}',
    { params: { path: { gameName, tagLine } } }
  );
  if (apiError) throw toHttpError(response.status, apiError);
  setHeaders({ 'cache-control': 'public, s-maxage=60, stale-while-revalidate=300' });
  return { account: data };
};
```

**Errors**

- Map riot-proxy's `ApiError` codes to three user-facing states: not found, rate limited (show retry time from `X-RateLimit-*`), and upstream unavailable.
- Log the proxy's `X-Request-Id` with every failure so a page error can be traced in riot-proxy's logs.
- Never show raw proxy error bodies to visitors.

**Caching**

- riot-proxy already caches Riot responses and reports it in `X-Cache` and `X-Cache-Age`. The site adds no cache of its own.
- Pages set `Cache-Control` with `s-maxage` and `stale-while-revalidate` so Cloudflare serves repeat views. Starting values: profile 60 s, finished match 1 day, champion analytics 10 min, live game no cache.
- Show data age on profile pages using `X-Cache-Age`, with a refresh button on a cooldown.

**Live data**

riot-proxy's WebSockets take the key as `?token=`, which a browser would expose. If live game or live update features are built, the SvelteKit server connects to the WebSocket and relays events to the browser as Server-Sent Events from a `+server.ts` endpoint.

**Static assets**

Champion, item, rune and spell images come from Data Dragon, which riot-proxy mirrors, and from CommunityDragon for anything Data Dragon lacks. `src/lib/assets.ts` is the only place URLs are built, keyed by patch version, so a CDN or path change is a one-file edit.

## Routes and pages

v1 is seven routes. Every page renders on the server and works without client JavaScript; interactivity is added on top.

| Route | Page | Data from riot-proxy | Phase |
| --- | --- | --- | --- |
| `/` | Search box, region picker, recent searches | None | 1 |
| `/summoner/[riotId]` | Profile: rank, recent matches, champion summary. The region comes from the account (ADR-037) | Account, league entries, match list | 2 |
| `/match/[matchId]` | Scoreboard, builds, timeline graphs. The region comes from the match id (ADR-037) | Match and timeline | 3 |
| `/champions` | Champion table: win, pick and ban rate | Champion analytics | 4 |
| `/champions/[key]` | Champion detail: builds, runes, matchups | Champion analytics | 4 |
| `/about` | What the site is, data freshness, legal text | None | 1 |
| `/healthz` | Liveness for Caddy and uptime checks | None | 1 |

**URL conventions**

- Riot IDs are written `GameName-TAG` in the path, URL-encoded: `/summoner/kr/Hide%20on%20bush-KR1`. `parseRiotId` splits on the last hyphen.
- Region is the platform slug in lower case (`euw`, `na`, `kr`, `oce`). One table in `src/lib/domain/regions.ts` maps slugs to whatever riot-proxy expects.
- Filters such as queue and champion live in query parameters, so every view is linkable and cacheable.

**Shared layout**

- Header with search, footer with the Riot legal boilerplate on every page.
- `+error.svelte` renders the three error states from the integration section.
- Dark theme only for v1. One theme is less CSS to maintain.

## Local development

Local development needs Node 22, pnpm, `just`, and a riot-proxy to talk to.

**Pick a proxy for development**

- The Proxmox dev VM, reached over the LAN: set `PROXY_URL=http://<vm-ip>:8080`. Simplest, and uses real data.
- A local riot-proxy from its Docker image, with your development Riot key. Use this when working offline from the VM.
- Recorded fixtures for tests: Playwright runs against a small mock server that replays `tests/fixtures/`, so tests never spend Riot rate limit.

**justfile**

```make
setup:      # first run on a new machine
    pnpm install
    git config core.hooksPath .githooks
    cp -n .env.example .env

dev:        # dev server with hot reload
    pnpm dev

gen:        # regenerate API types from the committed spec
    pnpm openapi-typescript openapi/riot-proxy.json -o src/lib/api/schema.d.ts

check:      # the one gate: everything a pipeline would run
    pnpm prettier --check .
    pnpm eslint .
    pnpm svelte-check --tsconfig ./tsconfig.json
    pnpm vitest run
    pnpm build

e2e:        # browser smoke tests against the mock proxy
    pnpm playwright test

image:      # build the production image locally
    docker build -t ninjagoldfinch-web:local .
```

`just check` is the contract. The pre-push hook runs it today; whatever pipeline you build later runs the same command, so there is one definition of passing.

**Testing scope**

- Unit: every function in `src/lib/domain/`, plus `toHttpError` and the cache helpers.
- Browser: one smoke test per route in the table above, checking it renders from fixtures and shows the legal footer.
- No snapshot tests of whole pages. They break on every style change and catch little.

## Deployment by hand

Deploying is `git pull`, build the image on the VM, restart one container. No registry and no pipeline are involved.

**Dockerfile**

```dockerfile
FROM node:22-alpine AS build
WORKDIR /app
RUN corepack enable
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile
COPY . .
RUN pnpm build && pnpm prune --prod

FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app/build ./build
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/package.json ./
USER node
EXPOSE 3000
CMD ["node", "build"]
```

**deploy/compose.yaml**

```yaml
services:
  web:
    build: ..
    restart: unless-stopped
    env_file: .env
    networks: [internal]

  riot-proxy:                       # omit if it stays on its own VM
    image: ghcr.io/ninjagoldfinch/riot-proxy:2
    restart: unless-stopped
    env_file: riot-proxy.env        # ENV=production, RIOT_API_KEY
    volumes: ["./data:/data"]
    networks: [internal]

  cloudflared:
    image: cloudflare/cloudflared:latest
    restart: unless-stopped
    command: tunnel run
    environment: [TUNNEL_TOKEN]
    networks: [internal]

networks:
  internal:
```

No service publishes a port. The Tunnel's public hostname `ninjagoldfinch.lol` points at `http://web:3000`, and riot-proxy is reachable only from `web`.

**Cloudflare, set once**

- Move the domain's DNS to Cloudflare and create a Tunnel; put its token in the VM's `.env` as `TUNNEL_TOKEN`.
- Add a Cache Rule making HTML eligible for cache and respecting origin `Cache-Control`. Cloudflare does not cache HTML by default.
- Add a rate-limiting rule on `/summoner/*` and `/match/*` to protect the Riot rate budget from scrapers.
- Set `ADDRESS_HEADER=CF-Connecting-IP` in the web `.env` so adapter-node sees the real client address.
- Turn on Cloudflare Web Analytics if you want page counts without adding a script dependency.

**Caddy** is needed only if you forward ports 80 and 443 instead of using the Tunnel. In that case add a `caddy` service, publish its ports, and reverse-proxy to `web:3000`; keep `deploy/Caddyfile` out of the repo until then.

**Release steps**

1. Locally: `just check`, merge the PR, tag `main` as `vX.Y.Z`, push the tag.
2. On the VM: `git fetch --tags && git checkout vX.Y.Z`.
3. `docker compose -f deploy/compose.yaml build web && docker compose -f deploy/compose.yaml up -d web`.
4. `curl -fsS https://ninjagoldfinch.lol/healthz` and load one profile page.

**Rollback:** check out the previous tag and repeat step 3. The site holds no state, so there is nothing to migrate back.

When you build your own pipeline, it replaces steps 2 to 4 and nothing else in this plan changes.

## CLAUDE.md

Copy this into `CLAUDE.md` at the repo root. It mirrors the working rules in riot-proxy so both repos behave the same way.

```text
# CLAUDE.md — ninjagoldfinch.lol

Server-rendered SvelteKit site in front of riot-proxy. The plan and task list
live in docs/IMPLEMENTATION.md. Read it before doing anything.

## Non-negotiables

- One task -> one branch -> one PR -> squash-merge. Never commit to main.
  Never batch tasks.
- Every PR ships tests for the behaviour it adds or changes.
- `just check` passes before a task is done. There is no CI; this command
  is the gate. Do not add GitHub Actions workflows or any CI/CD config.
- No secrets. PROXY_KEY lives only in .env. Fixtures are redacted: no
  `rpx_` and no `RGAPI-` strings anywhere in the repo.
- The proxy key never reaches the browser. Anything that reads it lives
  under src/lib/server/. Never import src/lib/server/ from client code,
  and never put a secret in a PUBLIC_ variable.
- Never call Riot directly. All data comes from riot-proxy through
  src/lib/server/proxy.ts. If the proxy lacks something, stop and ask;
  do not work around it.
- Never invent proxy semantics. Routes, fields, headers and error codes
  come from openapi/riot-proxy.json. Unknown -> ask.
- Never hand-edit src/lib/api/schema.d.ts. Run `just gen`.
- Riot policy: no MMR or ELO estimates, no custom-queue match history,
  legal boilerplate stays in the footer of every page.
- Stop and ask on ambiguity, unmet acceptance criteria, or a new runtime
  dependency.
- Log decisions in docs/DECISIONS.md (ADR-nnn). Tick tasks in
  docs/PROGRESS.md with the PR number.

## Layout

src/lib/server/      proxy client, env, cache helpers (server only)
src/lib/api/         generated OpenAPI types
src/lib/domain/      pure functions, each with a unit test
src/lib/components/  Svelte components
src/routes/          pages; +page.server.ts loads, +page.svelte renders
tests/unit/          Vitest
tests/e2e/           Playwright against the mock proxy
tests/fixtures/      redacted proxy responses
openapi/             committed copy of the riot-proxy spec
deploy/              compose file for the VM

## Commands

just setup    install, enable git hooks, create .env
just dev      dev server
just gen      regenerate API types from openapi/riot-proxy.json
just check    format, lint, svelte-check, unit tests, build
just e2e      Playwright smoke tests
just image    build the production image

## Conventions

- Svelte 5 runes only ($state, $derived, $props, $effect). No Svelte 4
  syntax: no `export let`, no `$:`, no stores for component state.
- Data loads in +page.server.ts. No client-side fetching of proxy data,
  no remote functions.
- Pages work without client JavaScript; enhance on top.
- TypeScript strict. No `any`; no non-null `!` on proxy data.
- Tailwind utilities with tokens from src/app.css. No inline hex colours.
- Every load sets Cache-Control through src/lib/server/cache.ts.
- Asset URLs only through src/lib/assets.ts.
- Conventional Commits, scoped: `feat(profile): ...`, footer `Task: P2-03`.
- Branch: <type>/<task-id>-<slug>.
- Commit messages and PR descriptions describe the change only. No AI
  attribution of any kind: no generated-with lines, no co-author
  trailers, no session links.

## Phase gates

After a phase's exit check passes: paste the result into
docs/PROGRESS.md, tag phase-P<n>, and pause for owner review before the
next phase.
```

## Phased task list

Six phases, each ending in a check you can run. One task is one branch and one PR.

### P0 — Repository and tooling

- [ ] P0-01 Scaffold with `sv`, Node adapter, Tailwind, Vitest, Playwright, ESLint, Prettier
- [ ] P0-02 Create the private repo, apply the GitHub settings, push
- [ ] P0-03 Add `justfile`, `.githooks/`, `.env.example`, `.gitignore`, `.dockerignore`
- [ ] P0-04 Add `CLAUDE.md`, `README.md`, `docs/IMPLEMENTATION.md`, `docs/DECISIONS.md`, `docs/PROGRESS.md`
- [ ] P0-05 Add `src/lib/server/env.ts` with start-up validation and tests

**Exit check:** on a fresh clone, `just setup && just check` passes, and a commit containing `rpx_test` is refused.

### P1 — Proxy client and site shell

- [ ] P1-01 Commit `openapi/riot-proxy.json`, add `just gen`, generate types
- [ ] P1-02 `src/lib/server/proxy.ts`, `toHttpError`, request-id logging in `hooks.server.ts`
- [ ] P1-03 Mock proxy server and first redacted fixtures for tests
- [ ] P1-04 Root layout: header, search form, footer with Riot boilerplate, `+error.svelte`
- [ ] P1-05 `/`, `/about`, `/healthz`; region table and `parseRiotId` with unit tests
- [ ] P1-06 `src/lib/assets.ts` and a `ChampionIcon` component

**Exit check:** searching a Riot ID on the home page redirects to a profile URL that returns the account name from the real dev proxy.

### P2 — Player profile

- [ ] P2-01 Profile load: account, rank entries, first page of matches
- [ ] P2-02 `RankBadge` and profile header with data age and refresh cooldown
- [ ] P2-03 `MatchRow`: champion, KDA, items, result, duration, queue
- [ ] P2-04 Queue and champion filters as query parameters; pagination
- [ ] P2-05 Champion summary panel from the loaded matches
- [ ] P2-06 Hide custom-queue matches; cache headers; error states

**Exit check:** a profile with 20 matches renders in one server response, works with JavaScript disabled, and a second request is served from Cloudflare cache.

### P3 — Match detail

- [ ] P3-01 Match load with timeline; scoreboard for both teams
- [ ] P3-02 Builds: items, runes, summoner spells, skill order
- [ ] P3-03 Timeline charts in SVG: gold difference and objective events
- [ ] P3-04 Expand a match inline from the profile page without a full reload
- [ ] P3-05 One player's build by riot-proxy's definitions (BLD-04): starter, boots, finished items, skill order, shop visits

**Exit check:** a match page loads directly by URL and from a profile row, and its charts match the numbers in the raw timeline fixture.

### P4 — Champion analytics

- [ ] P4-01 `/champions` table, sortable by win, pick and ban rate, filterable by role
- [ ] P4-02 `/champions/[key]` builds, runes and matchups
- [ ] P4-03 Sample-size display and a minimum-games threshold on every rate
- [ ] P4-04 Search without a region: the platform comes from the Riot ID (riot-proxy SITE-09); profile and match URLs drop their region, old ones redirect

**Exit check:** every figure on a champion page can be traced to a field in the proxy response, and low-sample rows are marked.

### P5 — Production

- [ ] P5-01 `Dockerfile` and `deploy/compose.yaml`; `just image` builds under 200 MB
- [ ] P5-02 Cloudflare DNS, Tunnel, cache rule, rate-limit rule
- [ ] P5-03 Security headers and a Content Security Policy in `hooks.server.ts`
- [ ] P5-04 First tagged release deployed by hand; rollback rehearsed once
- [ ] P5-05 External uptime check on `/healthz`; update the Riot Developer Portal product page with the live URL

**Exit check:** `https://ninjagoldfinch.lol` serves a profile over HTTPS, riot-proxy is unreachable from outside the VM, and a rollback to the previous tag takes under five minutes.

### SPD — speed (after riot-proxy v2.6.0)

riot-proxy v2.6.0 keeps analytics responses in memory and warms the champion table and patch list after each rebuild. This series removes what the site still adds. Measured on production on 2026-10-14 and 2026-10-15 (ADR-039): a champions page answers in 8–15 ms once riot-proxy is warm; a champion page nobody has viewed since the last rebuild takes about 200 ms, nearly all of it riot-proxy's cold reads.

- [ ] SPD-01 riot-proxy spec refreshed to v2.6.0 from the release binary; slow analytics calls logged with `X-Cache`; no LAN dev instance in the docs
- [ ] SPD-02 `patchVersions` held in memory for 5 minutes, as ADR-013 holds the lookups
- [ ] SPD-03 Dropped: stream `/champions`' patch list. riot-proxy warms it and answers in under 1 ms, and without JavaScript the picker would lose its patches (ADR-039)
- [ ] SPD-04 Dropped: stream the champion page's builds, matchups and patch list. At most about 110 ms on a champion's first view per rebuild, at the cost of "Loading…" cards without JavaScript; warming those calls is riot-proxy's (ADR-039)
- [ ] SPD-05 A timeout on every riot-proxy call: 5 s for analytics and static data, 30 s otherwise; a timeout is a 503, and optional calls degrade on their own
- [ ] SPD-06 Check and document Cloudflare's cache of `__data.json`

**Exit check:** none beyond each task's own; every task records before and after numbers from production in its PR.

### VS — tier ranges and builds against a lane opponent (after riot-proxy v2.7.0)

riot-proxy v2.7.0 adds `minTier` (a tier and every tier above it, summed) on the four champion analytics routes, `opponentId` on set builds (the champion's builds in a lane against one opponent), and `winRateLow` on every build. This series brings them to the champion pages. The plan, with the owner's answers, is `docs/notes/VS-plan.md`.

- [ ] VS-01 riot-proxy spec refreshed to v2.7.0 from the release binary; fixtures carry every field the spec requires; behaviour unchanged
- [ ] VS-02 A tier filter on `/champions` and `/champions/[key]`: one tier (`?rank=diamond`) or a tier and above (`?rank=diamond+`), Iron to Challenger; all tiers by default
- [ ] VS-03 Builds against a lane opponent on `/champions/[key]` (`?vs=galio&lane=mid`): a picker built from the matchups, matchup rows linking to it, no fallback to the detail's lists
- [ ] VS-04 Dropped: `winRateLow` is not shown, sorted on or used for marking (owner, 2026-10-19)

**Exit check:** with JavaScript disabled, `/champions/ahri?rank=diamond+&vs=galio` renders the range and the builds against Galio from the server.

## Riot policy checklist

These come from Riot's [General Policies](https://developer.riotgames.com/policies/general) (last updated May 29, 2025) and the [League of Legends developer docs](https://developer.riotgames.com/docs/lol). Re-read both before the production key review.

- [ ] Legal boilerplate is in the footer of every page: "ninjagoldfinch.lol isn't endorsed by Riot Games and doesn't reflect the views or opinions of Riot Games or anyone officially involved in producing or managing Riot Games properties. Riot Games, and all associated properties are trademarks or registered trademarks of Riot Games, Inc."
- [ ] No MMR or ELO calculators, and no other alternative to the official ranked ladder.
- [ ] No de-anonymising of players who cannot reasonably be identified from visible information.
- [ ] Custom-queue match history is not shown publicly without the player's opt-in.
- [ ] The site does not closely resemble Riot's own products in style or function.
- [ ] Riot logos and trademarks are used only where unavoidable; game art comes from Data Dragon.
- [ ] All traffic is HTTPS, and no API key appears in client code or in the repo.
- [ ] The production key is used for this product only.
- [ ] New features are submitted for audit on the product's Developer Portal page before launch.
- [ ] If the site is ever monetised: a free tier stays, and no betting or gambling features.

## Open decisions

Each of these changes a task above; none blocks P0.

- [ ] Is SvelteKit 3 stable yet? If yes, scaffold on 3.x; if no, stay on 2.x and log an ADR.
- [ ] What is the URL of riot-proxy's OpenAPI JSON, and does the spec cover every route the pages need?
- [ ] Does riot-proxy run in the same compose file as the site, or stay on its own VM with `PROXY_URL` pointing across the LAN?
- [ ] Which regions does v1 support in the region picker?
- [ ] Cloudflare Tunnel, or forwarded ports with Caddy?
- [ ] Does riot-proxy serve its Data Dragon mirror over HTTP, or should icons load from Riot's CDN directly?
- [ ] Does GitHub enforce branch protection on this private repo under your plan?

## Sources

- [riot-proxy README](https://github.com/NinjaGoldfinch/riot-proxy): auth model, endpoints, headers, deployment
- [riot-proxy CLAUDE.md](https://raw.githubusercontent.com/NinjaGoldfinch/riot-proxy/main/CLAUDE.md): working rules mirrored here
- [Riot Developer Portal: General Policies](https://developer.riotgames.com/policies/general)
- [Riot Developer Portal: League of Legends](https://developer.riotgames.com/docs/lol)
- [SvelteKit 3 pre-release status, August 2026](https://releases.sh/collections/frontend-frameworks/digest/2026-08-03)
- [DevClass on SvelteKit remote functions](https://devclass.com/devops/2026/08/20/sveltekit-3-puts-heat-on-nextjs-with-radical-approach-to-rpcs/5290688)
