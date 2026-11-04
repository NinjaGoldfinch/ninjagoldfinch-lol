# ninjagoldfinch.lol — Implementation Plan

> This is the original plan of 2026-10-09. Where an ADR in [DECISIONS.md](DECISIONS.md) or a later task supersedes it, the ADR wins. What is built now is in [PROGRESS.md](PROGRESS.md) and the docs set ([docs/README.md](README.md)).

Oct 9, 2026 · @Sam

## Overview and scope

ninjagoldfinch.lol is a server-rendered SvelteKit site that sits in front of riot-proxy and shows League of Legends player and champion stats. riot-proxy stays the only thing that talks to Riot; the site is the only thing that talks to riot-proxy.

**In scope for v1**

- Player search by Riot ID, profile page with rank and match history, match detail with timeline.
- Champion analytics pages, using what riot-proxy already serves.
- A private repo, a local dev loop, and a deploy you run by hand on the existing Proxmox host.

**Out of scope for now**

- CI/CD. No GitHub Actions workflows. The repo exposes one `just check` command that a pipeline of your own can call later. (Superseded by ADR-050, 2026-11-05: CI runs that command, and releases and deploys follow the shared pipeline.)
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

Start on the stable SvelteKit 2.x line. SvelteKit 3 was still in pre-release in August 2026; check its status before scaffolding and take 3.x only if it is stable. (Superseded: scaffolded on SvelteKit 3, ADR-001.)

| Layer | Choice | Notes |
| --- | --- | --- |
| Runtime | Node 22 LTS | Required by SvelteKit 3, so it avoids a second upgrade later |
| Package manager | pnpm | Pin with `packageManager` in `package.json` |
| Framework | SvelteKit 2.x, Svelte 5, TypeScript strict | Runes only; no Svelte 4 syntax. (Superseded: SvelteKit 3, ADR-001) |
| Adapter | `@sveltejs/adapter-node` | Plain Node server in a container |
| Data loading | `+page.server.ts` and `+server.ts` | No remote functions until they leave experimental |
| API client | `openapi-typescript` (dev) + `openapi-fetch` | Types generated from riot-proxy's OpenAPI spec |
| Styling | Tailwind CSS v4 | Design tokens in one `app.css`; no component kit yet |
| Charts | Hand-written SVG components | Add uPlot or LayerChart only when a timeline chart needs it |
| Unit tests | Vitest | Data-shaping functions and the proxy client wrapper |
| Browser tests | Playwright | A handful of smoke tests against a mock proxy |
| Lint and format | ESLint + Prettier with the Svelte plugins | Installed by the `sv` scaffolder |
| Task runner | `just` | Same as riot-proxy |
| Reverse proxy | Caddy | Only if you open ports instead of using the Tunnel. (Superseded: Tunnel only, no Caddy, ADR-038) |
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
│   └── Caddyfile            (superseded: none, ADR-038)
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
│   │   ├── components/      MatchRow, RankBadge, ChampionIcon, StatBar (never built)
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
| `ORIGIN` | `https://ninjagoldfinch.lol` | Needed by adapter-node for correct URLs and form checks. (Superseded: read at build time, ADR-014) |
| `PORT` | `3000` | Listen port inside the container |
| `PUBLIC_SITE_NAME` | `ninjagoldfinch.lol` | The only client-visible variable |

**Mint the key on the riot-proxy host**

```bash
./riot-proxy key create --name ninjagoldfinch-web     # read scope is the default
```

(Superseded: production's key is named `ninjagoldfinch-lol-prod`; see [docs/integration/authentication.md](integration/authentication.md).)

Use a separate key for local development (`--name ninjagoldfinch-dev`) so either can be revoked alone.

**Rules**

- Import secrets from `$env/dynamic/private` inside `src/lib/server/env.ts` and nowhere else. That file throws at start-up if a variable is missing. (Superseded: `src/env.ts` and `$app/env/private`, ADR-004.)
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

- Map riot-proxy's `ApiError` codes to three user-facing states: not found, rate limited (show retry time from `X-RateLimit-*`; superseded: `retryAfter` and `Retry-After`, ADR-007), and upstream unavailable.
- Log the proxy's `X-Request-Id` with every failure so a page error can be traced in riot-proxy's logs.
- Never show raw proxy error bodies to visitors.

**Caching**

- riot-proxy already caches Riot responses and reports it in `X-Cache` and `X-Cache-Age`. The site adds no cache of its own.
- Pages set `Cache-Control` with `s-maxage` and `stale-while-revalidate` so Cloudflare serves repeat views. Starting values: profile 60 s, finished match 1 day, champion analytics 10 min, live game no cache.
- Show data age on profile pages using `X-Cache-Age`, with a refresh button on a cooldown. (Superseded: riot-proxy's `fetchedAgeSeconds`, ADR-019.)

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

- Riot IDs are written `GameName-TAG` in the path, URL-encoded: `/summoner/kr/Hide%20on%20bush-KR1` (superseded: no region in the URL, `/summoner/Hide%20on%20bush-KR1`, ADR-037). `parseRiotId` splits on the last hyphen.
- Region is the platform slug in lower case (`euw`, `na`, `kr`, `oce`). One table in `src/lib/domain/regions.ts` maps slugs to whatever riot-proxy expects.
- Filters such as queue and champion live in query parameters, so every view is linkable and cacheable.

**Shared layout**

- Header with search, footer with the Riot legal boilerplate on every page.
- `+error.svelte` renders the three error states from the integration section.
- Dark theme only for v1. One theme is less CSS to maintain.

## Local development

Local development needs Node 22, pnpm, `just`, and a riot-proxy to talk to.

**Pick a proxy for development**

- The Proxmox dev VM, reached over the LAN: set `PROXY_URL=http://<vm-ip>:8080`. Simplest, and uses real data. (Superseded: there is no LAN dev instance, ADR-039.)
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

Deploying is `git pull`, build the image on the VM, restart one container. No registry and no pipeline are involved. (Superseded: production runs `node build` under systemd, not in Docker, ADR-038.)

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

**Caddy** (superseded: not used, ADR-038) is needed only if you forward ports 80 and 443 instead of using the Tunnel. In that case add a `caddy` service, publish its ports, and reverse-proxy to `web:3000`; keep `deploy/Caddyfile` out of the repo until then.

**Release steps**

1. Locally: `just check`, merge the PR, tag `main` as `vX.Y.Z`, push the tag.
2. On the VM: `git fetch --tags && git checkout vX.Y.Z`.
3. `docker compose -f deploy/compose.yaml build web && docker compose -f deploy/compose.yaml up -d web`.
4. `curl -fsS https://ninjagoldfinch.lol/healthz` and load one profile page.

**Rollback:** check out the previous tag and repeat step 3. The site holds no state, so there is nothing to migrate back.

When you build your own pipeline, it replaces steps 2 to 4 and nothing else in this plan changes.

## CLAUDE.md

The working rules are in [CLAUDE.md](../CLAUDE.md) at the repo root, which is the authority. This section once held a copy of it; the copy is gone so the two cannot drift apart.

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
- [ ] SPD-07 Timing for each load: one server log line per load over 100 ms, naming the route id and each riot-proxy call's spec path with its time; no `Server-Timing` header; cold and warm timings of each page type recorded
- [ ] SPD-08 Profile, match and champions loads start the patch and static-data calls alongside their main calls; same pages, same fallbacks
- [ ] SPD-09 Static data loaded at start-up through the `init` hook; after `PATCH_TTL_MS` the patch refreshes in the background; on a new patch, pages keep the old one until its lookups have loaded
- [ ] SPD-10 Preconnect to the image hosts from `src/lib/assets.ts`; the champion header icon and the profile icon eager with `fetchpriority="high"`; `decoding="async"` on every `<img>`
- [ ] SPD-11 Dropped: smaller page data. SPD-07's timings put a slow page's time in riot-proxy's calls and the lookups, not the size of its data (owner, 2026-11-03; ADR-046, ADR-047)

**Exit check:** none beyond each task's own; every task records before and after numbers from production in its PR.

SPD-07 to SPD-11 come from the plan approved on 2026-10-20, with the owner's answers, in `docs/notes/page-speed.md`.

### VS — tier ranges and builds against a lane opponent (after riot-proxy v2.7.0)

riot-proxy v2.7.0 adds `minTier` (a tier and every tier above it, summed) on the four champion analytics routes, `opponentId` on set builds (the champion's builds in a lane against one opponent), and `winRateLow` on every build. This series brings them to the champion pages. The plan, with the owner's answers, is [docs/notes/archive/VS-plan.md](notes/archive/VS-plan.md).

- [ ] VS-01 riot-proxy spec refreshed to v2.7.0 from the release binary; fixtures carry every field the spec requires; behaviour unchanged
- [ ] VS-02 A tier filter on `/champions` and `/champions/[key]`: one tier (`?rank=diamond`) or a tier and above (`?rank=diamond+`), Iron to Challenger; all tiers by default
- [ ] VS-03 Builds against a lane opponent on `/champions/[key]` (`?vs=galio&lane=mid`): a picker built from the matchups, matchup rows linking to it, no fallback to the detail's lists
- [ ] VS-04 Dropped: `winRateLow` is not shown, sorted on or used for marking (owner, 2026-10-19)

**Exit check:** with JavaScript disabled, `/champions/ahri?rank=diamond+&vs=galio` renders the range and the builds against Galio from the server.

### RV — fixes from the code review of 2026-11-03

The owner's review of the code and docs on 2026-11-03 found security, caching and display bugs, dead code and stale docs. The findings, task by task, are in `docs/notes/RV-plan.md`.

- [ ] RV-01 The deploy test cannot touch the real repo: every `GIT_*` location variable unset
- [ ] RV-02 Riot IDs checked before they reach riot-proxy: no `.` or `..`, the spec's lengths; the proxy client refuses a rewritten path
- [ ] RV-03 Every outbound call has a deadline that fires; anything but the caller's abort is a 503; a deadline on CommunityDragon; a 429 kept as a 429
- [ ] RV-04 Cache-Control on every response: `no-store` when none is set, degraded pages not cached, 307 for a tidied query
- [ ] RV-05 Lower-case match ids redirect to upper case
- [ ] RV-06 Match tabs keep the scroll; recent searches recorded on every profile
- [ ] RV-07 Match and profile edge cases: a zero-length timeline, CS/min without a duration, remakes in the summary count, whole seconds to wait; the skill order kept, as riot-proxy ranks a skill never levelled last
- [ ] RV-08 Champion pages: the tier in their wording, `?vs=` without regard to case
- [ ] RV-09 Dead code, unused page data and stale comments removed; no non-null assertions, by lint
- [ ] RV-10 One definition each for duplicated helpers and labels
- [ ] RV-11 Docs brought up to date with the ADRs; finished notes archived
- [ ] RV-12 Image and deploy: healthcheck port and start period, quoting, `.env.example`
- [ ] RV-13 Tests: no key or real PUUID in the fixtures; static data across patches and concurrent callers

**Exit check:** none beyond each task's own.

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
