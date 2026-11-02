# 0009: Champion pages don't stream; cold slices are riot-proxy's to warm

The site renders every section of a champion page before responding, and leaves warming slow analytics reads to riot-proxy.

## Context

Production's `/champions/__data.json` took 3.9 s on 2026-10-14. riot-proxy 2.6.0 then kept analytics in memory. The SPD series proposed streaming optional sections, decided by measurement (ADR-039, `docs/DECISIONS.md:519-527`).

## Decision

- No streaming: warm, it saves about 1 ms; cold, at most about 110 ms once per champion per rebuild, and a streamed card never fills in without JavaScript (`docs/DECISIONS.md:533`).
- The site does not cache analytics; requests to warm them go to riot-proxy.
- Analytics calls over 250 ms are logged with riot-proxy's `X-Cache` (`src/lib/server/proxy.ts:36-66`).

## Consequences

The first view of each champion after a rebuild takes about 200 ms until riot-proxy warms those calls (`docs/DECISIONS.md:538`).

## Status

Accepted; SPD-03 and SPD-04 dropped.

## Evidence

Measurements in ADR-039; `tests/unit/proxy.test.ts`.

---

**Sources:** `docs/DECISIONS.md:L515-L538`, `src/lib/server/proxy.ts:L36-L66`
**Last verified:** 2026-11-03 against commit `2948c82`
