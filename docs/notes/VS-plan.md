# VS plan: tier filters and builds against a lane opponent

Approved by the owner on 2026-10-19. riot-proxy v2.7.0 (FLT-03, FLT-04; riot-proxy ADR-170 to ADR-172). One task, one branch from `origin/main`, one PR.

## Owner's answers

|                                  | Answer                                                                                                                                                 |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Production riot-proxy            | v2.7.0. Whether a builds rebuild has filled the opponent tables is checked before VS-03 is deployed.                                                   |
| Range URL                        | `?rank=diamond` is Diamond only (riot-proxy `tier=DIAMOND`); `?rank=diamond+` is Diamond and above (`minTier=DIAMOND`). Never both.                    |
| Which tiers                      | Every tier, Iron to Challenger, alone or with every tier above it. All tiers (no `rank`) stays the default, so riot-proxy's warm list needs no change. |
| Opponent URL                     | `?vs=galio&lane=mid`: the opponent's Data Dragon id lower-cased, as champion pages are named, and a `ROLES` slug.                                      |
| `winRateLow`                     | Not now. VS-04 dropped.                                                                                                                                |
| Range on profile and match pages | Nothing to do: they don't link to champion pages.                                                                                                      |
| Cloudflare                       | Cache Everything; checked from outside that the cache key includes the query string (each `?patch=`/`?role=` view MISS then HIT with its own content). |

## Differences from the handoff

- The handoff's §6 ruled out a single-tier filter; the owner asked for one, so VS-02 sends `tier` or `minTier`.
- With `tier`, riot-proxy's summed row carries that tier, not `null`. The table and the header read the row whose `tier` is the body's own `tier`.
- `BuildPanel.svelte` and the skill grid are the match page's. The champion page's builds are only `SetBuilds.svelte`, which writes `–` for a part nobody chose.
- `tests/fixtures/builds/` is the match-timeline build fixture, not analytics.
- `opponentName` is not in the builds body's `required` list.

## VS-01: spec v2.7.0

`openapi/riot-proxy.json` from the release binary without its trailing newline; `just gen`. The analytics fixtures gain the fields the spec requires (`minTier`, `side`, `tier`, `opponentId`: `null`; `winRateLow`: the Wilson bound of each build's own wins and games). Tests: `fixtures-spec.test.ts` (every 200 fixture carries the spec's required fields; `winRateLow` is the Wilson bound, with ADR-171's 7/10 and 1/1); `champion-page.test.ts › reads a v2.7.0 body`. No ADR.

## VS-02: tier filter

- `champion-stats.ts`: `TIERS` (slug, riot-proxy name, label, highest first), `ChampionFilter.rank: { tier, andAbove } | null`, parsed from `rank`. `diamond+`, `diamond%2B` and `diamond ` (a literal `+` decoded as a space) all read as Diamond and above. Anything else is all tiers. `challenger+` is the same slice as `challenger` and redirects to it. `championQuery` writes the `+` literally. `analyticsQuery` sends `tier` or `minTier` after `role`.
- Sent on the table, detail, builds and matchups calls; never on `/patches`.
- `AnalyticsFilters.svelte`: `<select name="rank">` in the patch form (All tiers; Grandmaster+ … Iron+; Challenger … Iron), the noscript Apply shared. Role tabs, the patch form and the table→page links keep it.
- Labels: the scope line names the slice (`Diamond+`, `Diamond`, or `every tier`); By tier names it too.
- Fixtures: synthetic table, detail, builds and matchups bodies for `minTier=DIAMOND` and `tier=DIAMOND`.
- Tests: parsing (one tier, a range, `%2B`, a space, unknown, `challenger+`); `championQuery`; `analyticsQuery` (`tier` or `minTier`, never both); the loaders (no range on `/patches`); the summed row under a tier and a range; `toTierRows` with the range's tiers. e2e without JavaScript: picking a range changes the URL and the table; the role tabs and the champion link keep it.
- ADR-042.

## VS-03: builds against a lane opponent

- `parseVsPick` (`vs` resolved through the champion lookups, `lane` against `ROLES`, dropped when a role is picked); `vsChoices` (each opponent once, games summed over lanes, most first, ties by name, an unlisted pick last without a count; names from Data Dragon, then `opponentName`, then `#id`).
- `loadChampionPage` sends `opponentId` (and `role` from the lane or the role tab) on the builds call only. The Matchups card follows the builds' lane, as it does today.
- `SetBuilds.svelte`: a GET picker leading the build tabs (`action` ends `#builds`; role, patch and rank as hidden fields; submits on change, noscript Apply). Against an opponent, the 4th and 5th items, starter and skills are hidden when empty; an empty list says "No builds against X in this slice yet."; a failed call says so without the detail's lists; the picker stays.
- Matchups: the Lane cell (or the win rate, when a role hides the Lane column) links to `?vs=…&lane=…`, keeping role, patch and rank.
- Fixtures: synthetic builds against an opponent, with and without a lane; an empty body; a 400.
- Tests: `vsChoices`, `parseVsPick`, `toSetBuilds` against an opponent, the loader's query, the failed call. e2e without JavaScript: a matchup link, the picker, the empty case, the failed call.
- ADR-043.

## Without JavaScript: `/champions/ahri?rank=diamond+&vs=galio`

The load reads Diamond and above and Galio, and finds the URL canonical. Detail, builds (`minTier=DIAMOND&opponentId=3`), matchups (`minTier=DIAMOND`) and `/patches` are fetched in parallel. The page arrives whole: the header says Diamond+; the Builds card names the lane riot-proxy chose and shows the picker with Galio selected and an Apply button, the build tabs as links, and each build's runes, spells, boots and `item1 › item2 › 3rd`; By tier holds Diamond to Challenger. Choosing "any opponent" and Apply submits the form; the server drops the empty `vs` with a redirect, and the browser keeps `#builds`.

## 390 px

```
‹ All champions
[icon] Ahri
Ranked Solo/Duo · every region · Diamond+ · All patches
WIN 51.2%  PICK 4.1%  BAN 9.0%  GAMES 3,120
[All roles][Top][Jungle][Mid]
[Bot][Support]
[All patches ▾][Diamond+ ▾] (Apply, without JavaScript)
┌ Builds  Mid · 214 games with a build ─────┐
│ [vs Galio · 41 ▾] (Apply)                 │
│ [▣▣ 54.0% 88] [▣▣ 49.1% 61]              │
│ [▣▣ 47.0% 30]                             │
│ Runes ◉○  Spells ▣▣  Boots ▣              │
│ Item path  ▣ › ▣ › ▣ 52.0% · 40           │
└───────────────────────────────────────────┘
Matchups · Mid
By tier · Diamond+
```
