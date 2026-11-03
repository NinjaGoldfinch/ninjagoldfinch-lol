# 0009: Champion pages don't stream; cold slices are riot-proxy's to warm

The site renders every section of a champion page before responding, and leaves warming slow analytics reads to riot-proxy.

## Context

Production's `/champions/__data.json` took 3.9 s on 2026-10-14. riot-proxy 2.6.0 then kept analytics in memory. The SPD series proposed streaming optional sections, decided by measurement (ADR-039, `docs/DECISIONS.md:521-529`).

## Decision

- No streaming: warm, it saves about 1 ms; cold, at most about 110 ms once per champion per rebuild, and a streamed card never fills in without JavaScript (`docs/DECISIONS.md:535`).
- The site does not cache analytics; requests to warm them go to riot-proxy.
- Analytics calls over 250 ms are logged with riot-proxy's `X-Cache` (`src/lib/server/proxy.ts:37-67`).
- Since ADR-046, any request over 100 ms also logs one `slow load` line naming its route id and each riot-proxy call by spec path and time, so a cold slice shows on the page that waited on it (`src/lib/server/timing.ts:67-95`). The page-speed tasks' production measurements are in ADR-046 (SPD-07) and ADR-047 (SPD-08), SPD-10's local ones in [operations/performance.md](../../operations/performance.md); SPD-11 was dropped on them (owner, 2026-11-03).

## Consequences

The first view of each champion after a rebuild takes about 200 ms until riot-proxy warms those calls (`docs/DECISIONS.md:540`).

## Status

Accepted; SPD-03 and SPD-04 dropped.

## Evidence

Measurements in ADR-039; `tests/unit/proxy.test.ts`, `tests/unit/timing.test.ts`.

---

**Sources:** `docs/DECISIONS.md:L517-L540,L632-L661`, `src/lib/server/proxy.ts:L37-L67`, `src/lib/server/timing.ts:L67-L95`
**Last verified:** 2026-11-03 against commit `1cc09eb`
