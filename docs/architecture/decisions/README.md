# Architecture decisions

Short records of the design decisions that shape ninjagoldfinch.lol, each with its evidence. The full, dated log of all 45 decisions is [docs/DECISIONS.md](../../DECISIONS.md); these digests group and summarise the ones a newcomer needs.

Each record has the sections Context, Decision, Consequences, Status and Evidence.

| Record                                         | Summary                                                   | Based on                           |
| ---------------------------------------------- | --------------------------------------------------------- | ---------------------------------- |
| [0001](./0001-sveltekit-3-server-rendered.md)  | Server-rendered SvelteKit 3 site that holds the proxy key | ADR-001, plan                      |
| [0002](./0002-generated-proxy-types.md)        | One openapi-fetch client, types from riot-proxy's spec    | ADR-006, ADR-018, ADR-039          |
| [0003](./0003-systemd-not-docker.md)           | Production is `node build` under systemd                  | ADR-038, ADR-010                   |
| [0004](./0004-in-memory-lookups-only.md)       | No player-data cache; per-patch lookups in memory         | ADR-013, ADR-026, ADR-041          |
| [0005](./0005-edge-cache-policy.md)            | Cloudflare edge cache, one policy table                   | ADR-012, ADR-017, ADR-023, ADR-045 |
| [0006](./0006-build-time-origin.md)            | `ORIGIN` fixed at build time                              | ADR-014                            |
| [0007](./0007-region-from-riot-id.md)          | Region from the Riot ID and match id                      | ADR-037                            |
| [0008](./0008-deadlines-and-optional-calls.md) | Deadlines on every call; optional calls degrade alone     | ADR-040                            |
| [0009](./0009-no-streaming.md)                 | No streaming; riot-proxy warms analytics                  | ADR-039                            |
| [0010](./0010-local-hooks-instead-of-ci.md)    | No CI; `just check` behind a git hook                     | ADR-002, ADR-003                   |
| [0011](./0011-images-from-public-cdns.md)      | Images from Data Dragon CDN and CommunityDragon           | ADR-009, ADR-015, ADR-026          |

Decisions that belong to riot-proxy, not this repo, are documented there: fetching and archiving timelines, the two object stores (Onidel Object Storage as the system of record, Cloudflare R2 as an `rclone` replica), the consumer-key model and running bare metal on `ngf-prod-syd1` (`riot-proxy:deploy/README.md:14-18`, `riot-proxy:docs/DECISIONS.md:1510`).

UI and presentation decisions (ADR-020 to ADR-036, ADR-042, ADR-043) are not digested here; read them in [DECISIONS.md](../../DECISIONS.md).

---

**Sources:** `docs/DECISIONS.md:L1-L630`, `riot-proxy:deploy/README.md:L14-L18`, `riot-proxy:docs/DECISIONS.md:L1510`
**Last verified:** 2026-11-03 against commit `99cb82c`
