# 0004: The site caches no player data; only per-patch lookups are held in memory

The site keeps no cache of Riot player data or analytics; the one exception is static data that cannot change within a patch, held in process memory.

## Context

riot-proxy already caches Riot responses, so the plan said the site adds no cache of its own (`docs/IMPLEMENTATION.md:243`). But every page needs Data Dragon names, `item.json` alone is about 700 kB, and every page asked riot-proxy for the current patch (ADR-013, ADR-041).

## Decision

- Data Dragon `champion`, `item`, `summoner`, `runesReforged` and `queues` are reduced to small lookups and held for the current patch only (`src/lib/server/static-data.ts:22-37`, ADR-013).
- CommunityDragon stat shards are held the same way (`src/lib/server/cdragon.ts:5-39`, ADR-026).
- The current patch and Riot's version list are held for 5 minutes (`src/lib/server/patch.ts:45-66`, ADR-041).
- Concurrent callers share one fetch; a failed fetch is not kept.

## Consequences

- Measured: 831 ms for the first profile view after start-up against 56 ms after (`docs/DECISIONS.md:165`).
- After riot-proxy's mirror moves to a new patch, pages keep the old patch's names and icons for up to 5 minutes (`docs/DECISIONS.md:562`).
- A restart costs one cold page view, nothing more.

## Status

Accepted.

## Evidence

ADR-013, ADR-026, ADR-041; `tests/unit/static-data.test.ts`, `tests/unit/patch.test.ts`, `tests/unit/cdragon.test.ts`.

---

**Sources:** `docs/DECISIONS.md:L159-L169,L305-L319,L554-L562`, `docs/IMPLEMENTATION.md:L243`, `src/lib/server/static-data.ts:L22-L37`, `src/lib/server/cdragon.ts:L5-L39`, `src/lib/server/patch.ts:L45-L66`
**Last verified:** 2026-11-03 against commit `03faa33`
