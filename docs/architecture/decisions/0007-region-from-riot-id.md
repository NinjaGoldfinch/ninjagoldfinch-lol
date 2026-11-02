# 0007: The region comes from the Riot ID and the match id; URLs drop it

Profile and match URLs name no region: riot-proxy finds a player's platform from their account, and a match id's prefix names its platform.

## Context

A League account plays on one platform. riot-proxy 2.x (SITE-09) made `platform` optional on its profile routes and returns the player's `platform` and `region` (ADR-037, `docs/DECISIONS.md:487`). Asking visitors for a region was a guess they could get wrong.

## Decision

- Profiles at `/summoner/{GameName-TAG}`; the load maps riot-proxy's platform to a site region with `regionForPlatform`, and an unknown platform is a 503 (`src/lib/server/profile.ts:86-95`).
- Matches at `/match/{matchId}`; the region is the id's prefix (`regionForMatchId`, `src/lib/domain/regions.ts:46-50`).
- Old URLs `/summoner/{region}/{GameName-TAG}` and `/match/{region}/{matchId}` redirect with 308, keeping the query (`src/routes/summoner/[region]/[riotId]/+server.ts:9-13`, `src/routes/match/[region]/[matchId]/+server.ts:8-11`).
- Search has no region picker.

## Consequences

- One URL per player, so the edge holds one copy (`docs/DECISIONS.md:498`).
- The first view of a player costs riot-proxy one extra account-v1 call, cached 24 h soft, 96 h hard (`docs/DECISIONS.md:487`).
- Fixtures recorded with `?platform=oc1` drop it from their request path (`docs/DECISIONS.md:496`).

## Status

Accepted (P4-04, PR #59).

## Evidence

`tests/unit/regions.test.ts`, `tests/e2e/routes.test.ts`, `tests/e2e/match.test.ts` ("an old match URL with the wrong region still opens the match").

---

**Sources:** `docs/DECISIONS.md:L483-L498`, `src/lib/server/profile.ts:L86-L95`, `src/lib/domain/regions.ts:L40-L50`, `src/routes/summoner/[region]/[riotId]/+server.ts:L9-L13`, `src/routes/match/[region]/[matchId]/+server.ts:L8-L11`
**Last verified:** 2026-11-03 against commit `5fede17`
