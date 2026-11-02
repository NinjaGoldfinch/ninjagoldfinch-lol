# Data models

The page data models ninjagoldfinch.lol builds, and how their fields map to riot-proxy's responses and Riot's payloads, with notes where names or units differ.

The site has no database and no stored models. These are the objects each server load returns. SvelteKit serialises them into the HTML and into `__data.json`, so their fields are exactly what the page renders and nothing more (`src/lib/server/profile.ts:17`, `src/lib/domain/match-detail.ts:53`).

## Conventions across models

| Concept             | In the site                                                                                                      | Upstream                                                                                                 |
| ------------------- | ---------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| Rates               | 0–1 fractions (`winRate`, `pickRate`, `banRate`); `null` when riot-proxy has none                                | riot-proxy analytics, same scale                                                                         |
| Durations           | seconds (`duration`, build times `at`)                                                                           | Riot `gameDuration` seconds; timeline events in ms, converted (`src/lib/domain/builds.ts:215-242`)       |
| Start time          | `startedAt` epoch milliseconds                                                                                   | Riot `gameCreation`                                                                                      |
| Patch               | `major.minor`, e.g. `16.20`                                                                                      | Riot `gameVersion` is a game build (`16.20.824.8524`) (`src/lib/domain/matches.ts:160-167`)              |
| Data Dragon version | `ddragonVersion`, e.g. `16.20.1`                                                                                 | riot-proxy `ddragonVersion` on summaries; derived for match pages (`src/lib/server/patch.ts:30-41`)      |
| Champion            | `{ id, key, name, level? }`: `id` numeric, `key` Data Dragon id for the icon (`MonkeyKing`), `name` display name | Riot `championId`, `championName`; names from the current patch                                          |
| Role                | riot-proxy names (`MIDDLE`) inside data; site slugs (`mid`) in URLs; labels (`Mid`) on screen                    | Riot `teamPosition` (`src/lib/domain/champion-stats.ts:34-40`, `src/lib/domain/champion-stats.ts:44-47`) |
| Team                | `teamId` 100 = "Blue team", 200 = "Red team", else `Team <id>`                                                   | Riot `teamId` (`src/lib/domain/match-detail.ts:77`)                                                      |
| Result              | `'win' \| 'loss' \| 'remake'`; `remake` when any player has `gameEndedInEarlySurrender`                          | Riot `win`, `gameEndedInEarlySurrender`                                                                  |
| CS                  | `totalMinionsKilled + neutralMinionsKilled`                                                                      | Riot, two fields summed (`src/lib/domain/matches.ts:78`)                                                 |
| Missing names       | `Item 1234`, `Queue 1234`, `Champion 1234`, or riot-proxy's own name                                             | —                                                                                                        |
| Queue names         | Riot's description without team size and "games": `5v5 Ranked Solo games` → `Ranked Solo`                        | `/v1/static/queues` (`docs/DECISIONS.md:167`)                                                            |

PUUIDs are never part of a model (ADR-032).

## `ProfileData` — `/summoner/{riotId}`

Defined in `src/lib/server/profile.ts:18-51`, built at `:128-153`.

| Field                             | Type                                       | From                                                                                                            |
| --------------------------------- | ------------------------------------------ | --------------------------------------------------------------------------------------------------------------- |
| `region`                          | `{ slug, label }`                          | riot-proxy profile `platform` → `regionForPlatform`                                                             |
| `riotId`                          | `{ gameName, tagLine }`                    | profile `account.gameName`/`tagLine`, else the URL                                                              |
| `summoner`                        | `{ profileIconId, summonerLevel } \| null` | profile `summoner` (Riot `SummonerDTO`)                                                                         |
| `ranks`                           | `LeagueEntry[] \| null`                    | profile `league` (Riot `LeagueEntryDTO`: `queueType`, `tier`, `rank`, `leaguePoints`, `wins`, `losses`)         |
| `fetchedAgeSeconds`               | `number \| null`                           | The oldest of profile `fetchedAgeSeconds.summoner`, `.league` and matches `matchIdsFetchedAgeSeconds` (ADR-019) |
| `refreshAvailableIn`              | `number` (s)                               | The larger of the profile's and the match page's                                                                |
| `matches`                         | `MatchRow[] \| null`                       | matches `matches[]`, custom games removed; `null` if the call failed                                            |
| `matchesError`                    | `{ status, retryAfter? } \| null`          | The failed match call, classified 404/429/503                                                                   |
| `customHidden`                    | `boolean`                                  | Whether any custom game was removed                                                                             |
| `hasMore`                         | `boolean`                                  | matches `hasMore`                                                                                               |
| `filter`                          | `MatchFilter` `{ queue, champion, page }`  | URL                                                                                                             |
| `queueOptions`, `championOptions` | `{ id, name }[]`                           | Data Dragon names for the filter selects                                                                        |
| `archiveComplete`                 | `boolean \| null`                          | matches `archive.complete`; `null` without a champion filter                                                    |
| `patch`                           | `string`                                   | Current Data Dragon version                                                                                     |

`null` for `summoner` or `ranks` means riot-proxy listed that part in `warnings` (`src/lib/server/profile.ts:21-23`).

### `MatchRow`

One profile row, from a riot-proxy `MatchSummary` (`src/lib/domain/matches.ts:9-81`): `matchId`, `queue` (named from `queueId`), `playedAgo` (text, as of render time), `duration`, `ddragonVersion`, `result`, `champion`, `kills`, `deaths`, `assists`, `cs`, `items` (slots 0–6, 6 is the trinket), `roleBoundItem` (bot laners only, ADR-020), `spells`, `runes` (keystone and secondary path), `position`. Rows without the player's own line or champion are dropped.

## `MatchDetail` — `/match/{matchId}`

Defined in `src/lib/domain/match-detail.ts:53-72`, built by `toMatchDetail` (`:90-155`) from the hand-parsed Riot match and timeline (`src/lib/api/match.ts`).

| Field            | Type                      | From                                                                                                                                                           |
| ---------------- | ------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `matchId`        | `string`                  | Riot `metadata.matchId`                                                                                                                                        |
| `region`         | `{ slug, label }`         | The match id's prefix                                                                                                                                          |
| `queue`          | `string`                  | Riot `info.queueId`, named                                                                                                                                     |
| `startedAt`      | epoch ms                  | Riot `info.gameCreation`                                                                                                                                       |
| `duration`       | seconds                   | Riot `info.gameDuration`                                                                                                                                       |
| `patch`          | `major.minor`             | Riot `info.gameVersion`                                                                                                                                        |
| `ddragonVersion` | `string`                  | Newest Data Dragon version with the same `major.minor`, else current (`src/lib/server/match.ts:80`)                                                            |
| `teams`          | `TeamScoreboard[]`        | Riot `info.participants` grouped by `teamId`, `info.teams`                                                                                                     |
| `gold`           | `GoldFrame[] \| null`     | Per timeline frame, each team's summed `totalGold`                                                                                                             |
| `objectives`     | `ObjectiveKill[] \| null` | Timeline `ELITE_MONSTER_KILL` (to `killerTeamId`) and `BUILDING_KILL` (to the other team) (ADR-029)                                                            |
| `builds`         | `Build[]`                 | Per participant: timeline build and rune page                                                                                                                  |
| `complete`       | `boolean`                 | Added by `loadMatch`: false when the timeline, Data Dragon lookups or stat shards fell back; such a page is not cached (`src/lib/server/match.ts:18-22,76-84`) |

`TeamScoreboard` (`:39-51`): `teamId`, `name`, `result`, summed `kills`/`deaths`/`assists`/`gold`, `objectives` (towers, inhibitors, dragons, barons, `riftHerald`, `horde` = voidgrubs, from Riot `teams[].objectives`), `bans`, `players`.

`ScoreboardLine` (`:18-37`): `participantId`, `riotId` (from Riot `riotIdGameName`, `riotIdTagline`), `champion`, `position`, KDA, `cs`, `gold` (`goldEarned`), `damage` (`totalDamageDealtToChampions`), `vision` (`visionScore`), items, spells, runes.

`Build` (`src/lib/domain/builds.ts:206-211`): `participantId`; `timeline` (`TimelineBuild`: `core` starter, boots and first six finished items with times; `skillOrder` such as `QWE`; `skills` in order taken; `visits` grouped purchases) or `null` without a timeline; `runes` (`RunePageView`: primary and secondary paths, three stat shards from CommunityDragon). The definitions follow riot-proxy's BLD-04 (ADR-032).

## `ChampionsPage` — `/champions`

Defined in `src/lib/server/champions.ts:14-24`.

| Field            | From                                                                                                                                                                                                                                                     |
| ---------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `table`          | `ChampionTable` (`src/lib/domain/champion-stats.ts:197-241`): `patch`, `rows[]` of `{ id, key, name, games, winRate, pickRate, banRate }`. Only rows whose `tier` equals the response's `tier` are kept, so per-tier rows are never shown as summed ones |
| `patches`        | analytics `patches[].patch`, newest first; empty if the call failed                                                                                                                                                                                      |
| `ddragonVersion` | Current Data Dragon version                                                                                                                                                                                                                              |
| `championNames`  | For the search box suggestions                                                                                                                                                                                                                           |
| `complete`       | false when the patch list or Data Dragon lookups fell back; such a page is not cached                                                                                                                                                                    |

The page adds `filter` (`ChampionFilter`: `role`, `patch`, `rank`) from the URL.

## `ChampionPage` — `/champions/{key}`

Defined in `src/lib/server/champion-page.ts:31-57`.

| Field                             | Type                                            | From                                                                                                                                                                                  |
| --------------------------------- | ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `championId`, `champion`          | `number`, `{ id, name }`                        | Resolved from the URL against Data Dragon names                                                                                                                                       |
| `patch`                           | `string \| null`                                | Detail `patch` (`all` or `major.minor`)                                                                                                                                               |
| `stats`                           | `{ games, winRate, pickRate, banRate } \| null` | Detail `stats[]`, the row whose `tier` is the response's                                                                                                                              |
| `tiers`                           | `TierRow[]`                                     | Detail `byTier[]`, highest tier first; `UNKNOWN` labelled "Unplaced" and last (`src/lib/domain/champion-page.ts:52-78`)                                                               |
| `setBuilds`                       | `SetBuilds \| null`                             | Builds route: `role`, `totalGames`, `builds[]` of `SetBuild` (`core` two items, `next` up to three options for items 3–5, `starter`, `boots`, `skillOrder`, `runes`, `spells`, rates) |
| `vs`, `vsChoices`                 | `VsPick \| null`, `VsChoice[]`                  | URL `vs`/`lane`; choices from the matchups                                                                                                                                            |
| `popular`                         | `PopularChoices`                                | Detail `items`, `runes`, `spells` lists, shown when there are no set builds                                                                                                           |
| `matchups`                        | `Matchup[] \| null`                             | Matchups route: `opponentId`, `opponentName`, `role`, `games`, `winRate`                                                                                                              |
| `matchupRole`                     | `string \| null`                                | The role asked for, else the set builds' role                                                                                                                                         |
| `patches`                         | `string[]`                                      | The champion's patch list                                                                                                                                                             |
| `ddragonVersion`, `championNames` |                                                 | As above                                                                                                                                                                              |
| `complete`                        | `boolean`                                       | false when the set builds, matchups or patch list failed; such a page is not cached                                                                                                   |

Against a lane opponent the 4th and 5th item steps are dropped and the card omits skills and starter, because riot-proxy returns them empty (ADR-043).

---

**Sources:** `src/lib/server/profile.ts:L17-L154`, `src/lib/server/match.ts:L18-L22,L76-L84`, `src/lib/server/patch.ts:L30-L41`, `src/lib/server/champions.ts:L14-L24`, `src/lib/server/champion-page.ts:L31-L57`, `src/lib/domain/matches.ts:L9-L85,L160-L167`, `src/lib/domain/match-detail.ts:L18-L155`, `src/lib/domain/builds.ts:L21-L214`, `src/lib/domain/champion-stats.ts:L34-L40,L197-L241`, `src/lib/domain/champion-page.ts:L17-L215`, `src/lib/domain/champion-stats.ts:L44-L47`, `src/lib/api/match.ts`, `docs/DECISIONS.md:L167`
**Last verified:** 2026-11-03 against commit `5fede17`
