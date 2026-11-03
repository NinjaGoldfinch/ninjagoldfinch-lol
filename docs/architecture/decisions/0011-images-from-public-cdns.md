# 0011: Images load from Riot's Data Dragon CDN and CommunityDragon

The Browser loads champion, item, spell, rune and icon images straight from public CDNs; the host serves no image traffic.

## Context

riot-proxy mirrors Data Dragon's JSON for the site, but when this was decided no route served images (ADR-009, `docs/DECISIONS.md:107`). riot-proxy later added a `/ddragon/…` image mirror, reachable only inside the host's network in the planned layout (ADR-018, `docs/DECISIONS.md:225`).

## Decision

- Image URLs are built only in `src/lib/assets.ts`: Data Dragon CDN for champions, items, profile icons, spells and runes; CommunityDragon for lane icons and stat shards (`src/lib/assets.ts:1-73`, ADR-009, ADR-015, ADR-026).
- The patch in each URL comes from riot-proxy's `/v1/static/versions`.

## Consequences

- No image bandwidth through `ngf-prod-syd1`.
- A future Content Security Policy must allow `img-src https://ddragon.leagueoflegends.com https://raw.communitydragon.org` (`docs/DECISIONS.md:111,194`).
- Moving to a mirror is a one-file change.

## Status

Accepted.

## Evidence

`tests/unit/assets.test.ts`.

---

**Sources:** `docs/DECISIONS.md:L103-L111,L185-L194,L225`, `src/lib/assets.ts:L1-L73`
**Last verified:** 2026-11-03 against commit `ea998cb`
