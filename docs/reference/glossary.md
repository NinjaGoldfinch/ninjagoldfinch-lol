# Glossary

Definitions of the terms used across these docs and the code, with where each one matters. Names of services, environments and keys are defined in [\_meta/vocabulary.md](../_meta/vocabulary.md); this page expands its domain terms.

## League of Legends and Riot terms

**Riot ID.** A player's public name, `GameName#TAG`. The site writes it `GameName-TAG` in URLs and splits on the last hyphen, since a tag line has none, and holds the parts to riot-proxy's 1–16 and 1–5 characters (`src/lib/domain/riot-id.ts:14-60`). Used in profile URLs ([api/endpoints.md](../api/endpoints.md)).

**PUUID.** Riot's permanent player id. riot-proxy returns it with a profile; the site uses it server-side to request the match list and to find a player in a timeline, and never sends it to the browser (`src/lib/api/match.ts:8-9`; checked 2026-10-20, [deployment/security.md](../deployment/security.md)). Fixtures replace it with `fixture-puuid-<hash>` (`tests/redact.ts:1-38`).

**Platform.** A platform routing value naming one game server, such as `oc1`, `euw1`, `kr` (`src/lib/domain/regions.ts:15-31`). riot-proxy reports the player's platform with the profile, and the match list needs it.

**Regional route.** A regional routing value, `americas`, `europe`, `asia` or `sea`, used by Riot's account and match APIs. Each platform belongs to one (`src/lib/domain/regions.ts:1-2,15-31`); for example `oc1` → `sea`. The site's riot-proxy match path uses it: `GET /v1/lol/matches/{region}/{matchId}` ([integration/contract.md](../integration/contract.md)).

**Region slug.** The site's lower-case name for a platform, such as `oce` or `euw`, with a label such as "Oceania". There are 15 (`src/lib/domain/regions.ts:15-31`); `oce` is the default (`src/lib/domain/regions.ts:33`). URLs no longer carry it: old `/summoner/{region}/{riotId}` and `/match/{region}/{matchId}` URLs redirect (ADR-037, [api/pagination-filtering-and-versioning.md](../api/pagination-filtering-and-versioning.md)).

**Match ID.** `<PLATFORM>_<number>`, e.g. `OC1_712351051`. Its prefix names the platform, so the match URL needs no region; an ID that does not match `^[A-Za-z0-9]+_[0-9]+$` with a known prefix is a 404 before any riot-proxy call (`src/lib/domain/regions.ts:46-50`).

**Timeline.** Riot's per-minute frames and events for one match. The site uses it for the gold chart, objectives, and each player's item and skill order. It is optional: without it the match page still shows the scoreboard (`src/lib/server/match.ts:20-28`).

**Queue ID.** Riot's number for a game mode, e.g. 420 Ranked Solo/Duo. Queue 0, or none, is a custom game, which the site never shows (Riot policy; `src/lib/domain/matches.ts:155-157`, `CLAUDE.md:24`).

**Patch.** A game version's `major.minor`, e.g. `16.20`. Champion statistics are filtered by patch ([api/pagination-filtering-and-versioning.md](../api/pagination-filtering-and-versioning.md)).

**Data Dragon version.** A full Data Dragon version, e.g. `16.20.1`, the "current patch" the site builds image URLs and loads names for. Held for 5 minutes (`src/lib/server/patch.ts:47-68`). A match from an older patch uses that patch's Data Dragon version for its icons (`src/lib/server/patch.ts:36-43`, `src/lib/server/match.ts:69`).

**Data Dragon CDN, CommunityDragon.** Riot's static asset CDN and a community mirror of game data. The Browser loads images from both; the server reads only stat shard names from CommunityDragon's `perks.json` (`src/lib/assets.ts:7-71`, `src/lib/server/cdragon.ts:11-28`).

**Stat shards.** The three small rune bonuses below the rune trees. Their names come from CommunityDragon because Data Dragon lacks them (ADR-015, ADR-026).

## riot-proxy and site terms

**Consumer key.** A riot-proxy API key issued to one consumer, sent as `Authorization: Bearer`. The site's is in `PROXY_KEY`; production's is named `ninjagoldfinch-lol-prod` ([integration/authentication.md](../integration/authentication.md)).

**Analytics.** riot-proxy's champion statistics, computed from the matches it archives (`/v1/lol/analytics/*`). The site shows Ranked Solo/Duo only (`ANALYTICS_QUEUE`, `src/lib/domain/champion-stats.ts:30`).

**Set build.** riot-proxy's aggregated build for a champion, role and slice: starter, boots, items, skill order, with win rates. Shown on champion pages ([data/models.md](../data/models.md)).

**Matchup.** A champion's results against one lane opponent. A champion page can show set builds against a picked opponent, `?vs=<champion>&lane=<lane>` (ADR-043).

**Tier, tier range.** The rank filter on champion pages: `?rank=diamond` is one tier (riot-proxy's `tier`), `?rank=diamond+` is that tier and above (`minTier`) (ADR-042).

**Low sample.** A rate computed from fewer than 100 games (`LOW_SAMPLE_GAMES`, `src/lib/domain/champion-stats.ts:22`). Rows are shown, marked (ADR-035).

**Refresh.** The profile's POST form action that asks riot-proxy to re-read the player from Riot; riot-proxy allows it once a minute per player and part (ADR-012, [integration/contract.md](../integration/contract.md)).

**Fetched age.** riot-proxy's seconds since it last read each part of a profile from Riot (`fetchedAgeSeconds`); the profile shows "Updated N minutes ago" from the oldest part (`src/lib/server/profile.ts:134-135`, ADR-019).

**Essential call, optional call.** A riot-proxy call whose failure fails the page, versus one whose failure only degrades a section, wrapped in `optional()` (`src/lib/server/errors.ts:41-58`, ADR-040).

**Budget (deadline).** The time limit on one riot-proxy call: 5 s for analytics and static data, 30 s otherwise; past it the call is a 503 (`src/lib/server/proxy.ts:55-87`).

**Edge cache.** Cloudflare's cache of rendered pages, controlled by the `Cache-Control` the site sends (`src/lib/server/cache.ts:5-16`, [data/caching.md](../data/caching.md)).

**In-memory hold.** A value the site keeps in process memory to avoid asking riot-proxy every time: the current patch (5 min), Data Dragon names and stat shards (per patch) ([data/caching.md](../data/caching.md)).

**Request id.** riot-proxy's `X-Request-Id`, logged by the site on each failed call so the failure can be found in riot-proxy's logs ([operations/observability.md](../operations/observability.md#correlating-with-riot-proxy)).

**Fixture, synthetic fixture.** A recorded riot-proxy response replayed by the mock proxy; a synthetic one is hand-written, named `synthetic-*.json`, with a `_note` ([workflows/testing.md](../workflows/testing.md#fixtures)).

**Mock proxy.** `tests/mock-proxy/`, a small HTTP server that replays fixtures in place of riot-proxy for e2e tests and local work ([workflows/testing.md](../workflows/testing.md#how-riot-proxy-is-mocked)).

**The gate.** `just check`, the one required check before a task is done; there is no CI ([workflows/release-process.md](../workflows/release-process.md)).

**ADR.** An architecture decision record in `docs/DECISIONS.md` (ADR-001 to ADR-043); digests in [architecture/decisions/README.md](../architecture/decisions/README.md). riot-proxy has its own numbered ADRs; these docs prefix those with `riot-proxy:`.

**Task ID, phase.** Plan identifiers such as `P2-03` or `VS-03`, used in branch names and commit footers; phases P0–P4 end with a `phase-P<n>` tag ([workflows/release-process.md](../workflows/release-process.md#versioning-and-tags)).

---

**Sources:** `src/lib/domain/riot-id.ts:L14-L40`, `src/lib/domain/regions.ts:L1-L50`, `src/lib/domain/matches.ts:L155-L157`, `src/lib/domain/champion-stats.ts:L22,L30`, `src/lib/api/match.ts:L8-L9`, `src/lib/server/match.ts:L20-L28,L69`, `src/lib/server/patch.ts:L36-L68`, `src/lib/server/profile.ts:L134-L135`, `src/lib/server/errors.ts:L41-L58`, `src/lib/server/proxy.ts:L55-L87`, `src/lib/server/cache.ts:L5-L16`, `src/lib/server/cdragon.ts:L11-L28`, `src/lib/assets.ts:L7-L71`, `tests/redact.ts:L1-L38`, `CLAUDE.md:L24`, `docs/DECISIONS.md` (ADR-012, 015, 019, 026, 035, 037, 040, 042, 043), `docs/_meta/vocabulary.md`
**Last verified:** 2026-11-03 against commit `b17c9f8`
