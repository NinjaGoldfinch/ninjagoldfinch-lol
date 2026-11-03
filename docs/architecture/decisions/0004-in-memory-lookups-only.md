# 0004: The site caches no player data; only per-patch lookups are held in memory

The site keeps no cache of Riot player data or analytics; the one exception is static data that cannot change within a patch, held in process memory.

## Context

riot-proxy already caches Riot responses, so the plan said the site adds no cache of its own (`docs/IMPLEMENTATION.md:247`). But every page needs Data Dragon names, `item.json` alone is about 700 kB, and every page asked riot-proxy for the current patch (ADR-013, ADR-041). Even with both held, the first page after a restart waited for them, and after 5 minutes the next request waited for the version list again (ADR-048).

## Decision

- Data Dragon `champion`, `item`, `summoner`, `runesReforged` and `queues` are reduced to small lookups and held per patch (`src/lib/server/static-data.ts:22-51`, ADR-013). Two patches are held, the one pages use and a new one loading before they switch to it; a third drops the oldest (`HELD_PATCHES`, ADR-048).
- CommunityDragon stat shards are held the same way (`src/lib/server/cdragon.ts:6-37`, ADR-026).
- The current patch and Riot's version list are held (ADR-041). Once older than 5 minutes they are still served at once while one background refresh runs; a new patch is switched to only after its Data Dragon lookups have loaded (its stat shards load alongside without holding back the switch), and a failed refresh keeps the old patch (`src/lib/server/patch.ts:51-129`, ADR-048).
- All three are loaded at start-up by the server `init` hook, not awaited (`src/hooks.server.ts:11-13`, `src/lib/server/patch.ts:136-146`, ADR-048).
- Concurrent callers share one fetch; a failed fetch is not kept.

## Consequences

- Measured before start-up loading: 831 ms for the first profile view after start-up against 56 ms after (`docs/DECISIONS.md:165`). Since ADR-048 no visitor waits for the lookups after a deploy, and once a patch is held no request waits on `/v1/static/versions`.
- After riot-proxy's mirror moves to a new patch, pages keep the old patch's names and icons for up to 5 minutes plus the time the new lookups take. If CommunityDragon has no `perks.json` for the new patch yet, match pages on the new patch show no stat shards until it has, and each match page tries again. While riot-proxy fails a refresh, each request after the 5 minutes starts another, one at a time (`docs/DECISIONS.md:564,697-703`).
- Holding two patches doubles the lookups' memory for the days after a patch change: a few MB.

## Status

Accepted.

## Evidence

ADR-013, ADR-026, ADR-041, ADR-048; `tests/unit/static-data.test.ts`, `tests/unit/patch.test.ts`, `tests/unit/cdragon.test.ts`.

---

**Sources:** `docs/DECISIONS.md:L159-L169,L305-L319,L556-L564,L684-L703`, `docs/IMPLEMENTATION.md:L247`, `src/lib/server/static-data.ts:L22-L51`, `src/lib/server/cdragon.ts:L6-L37`, `src/lib/server/patch.ts:L51-L146`, `src/hooks.server.ts:L11-L13`
**Last verified:** 2026-11-03 against commit `e183749`
