# Server status card: plan and requests for riot-proxy

Owner request 2026-11-10: improve the front page's server status card, and label what riot-proxy would have to change for it. With nothing open the card was one line, "All services running", over about 200 px of empty card.

The site reads Riot's status only through riot-proxy's `GET /v1/lol/status/{platform}`, which passes lol-status-v4's `PlatformDataDto` through for one platform. So the card can show what that payload holds for the region picked, and nothing else. FP-04 does that. Everything past it waits on riot-proxy and is labelled below (`RP-1` to `RP-5`); none of it is built or assumed.

## What the feed holds, and what the card used

| In `PlatformDataDto`                                                 | Before FP-04                   | FP-04                                                                |
| -------------------------------------------------------------------- | ------------------------------ | -------------------------------------------------------------------- |
| `incidents[]`, `maintenances[]`: `id`, `titles[]`                    | Shown                          | Shown, worst first, under a count: `2 incidents · 1 maintenance`     |
| `incident_severity`, `maintenance_status`                            | Shown as a label, one red dot  | Label, and a dot per tone: red, amber, grey, lavender                |
| `updates[]`: `translations[]`, `publish`, `created_at`, `updated_at` | Not read                       | The newest published update's text, under its entry (three lines)    |
| `updated_at`, `created_at`                                           | `updated_at` parsed, not shown | `updated 3 hours ago`, or `opened …` for an entry never updated      |
| `platforms[]` (`windows`, `macos`, …), `archive_at`, `locales`       | Not read                       | Not read                                                             |
| Anything when nothing is open                                        | The feed has two empty lists   | The all-clear state fills the card; a link to Riot's own status page |

The feed has no per-service rows, no history, no other platforms, and no start time for a scheduled maintenance (Riot writes it into the update's text, which FP-04 now shows).

## Tasks

### FP-04: show what the feed has (this PR; no riot-proxy change)

- A first line that counts what is open, with a dot for the worst entry.
- Entries worst first: critical, warnings and a maintenance under way, notices, then other maintenance.
- Each entry's newest published update, in English when it has it, and when the entry was last updated.
- With nothing open, "All services running" centred in the card with "No open incidents or maintenance on Oceania."
- A link to Riot's status page for the region (`https://status.riotgames.com/lol?region=oc1&locale=en_US`), in every state, the unavailable one included.
- Ages are counted on the server at render, so the page hydrates to the same text. ADR-075.

### FP-05: other regions at a glance (needs RP-1)

Under the picked region's status, one small row per other region that has something open ("Korea · 1 incident"), each a link to `/?region=kr`; "No open incidents on the other 13 regions" otherwise. This is what would fill the card when the picked region is clear.

The site will not build this from the route it has: fourteen calls per uncached view inside the front page's 2 s deadline, fourteen counts against the site key's quota, and one failing platform would send `/` out as `no-store` (ADR-072).

### FP-06: recently closed (needs RP-3)

With nothing open: "Last incident: Ranked queues disabled · closed 2 days ago". The pass-through shows only what Riot lists now.

### FP-07: generated types replace the parsers (needs RP-2)

`parseStatus` goes; the generated types are used as for every other route (ADR-071 expected this).

## Requests for riot-proxy

Each is riot-proxy's own task. The shapes are suggestions: the site builds only on what `openapi/riot-proxy.json` says once a release has it.

| Label    | Change in riot-proxy                                                                                                                                                                                                                                                                                                                     | Unlocks                                              | Size   |
| -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------- | ------ |
| **RP-1** | **Every platform's status in one call**, such as `GET /v1/lol/status`: per platform, the number of open incidents and of open maintenances, the worst `incident_severity`, and how long ago riot-proxy read it from Riot. Typed in the spec. A platform whose read failed is reported as such, not as a failed call.                     | FP-05                                                | Medium |
| **RP-2** | **A schema for the 200 body** of `/v1/lol/status/{platform}` (the site no longer reads `/v1/lol/rotations/{platform}`, ADR-076): today `application/json: {}`, so the generated type is `unknown`. The fields the site reads are in `docs/integration/contract.md`, "Fields the site reads".                                             | FP-07                                                | Small  |
| **RP-3** | **Entries riot-proxy saw close**: an incident or maintenance that has left Riot's feed, kept for some days with when it was last seen. riot-proxy would have to read each platform's feed on its own timer for this, not only when asked. Served on RP-1's route, or on one of its own.                                                  | FP-06                                                | Medium |
| **RP-4** | **`me1` accepted** wherever a platform is. riot-proxy 2.10.0 answers 400 for it, so the Middle East is left out of the front page's picker (ADR-072).                                                                                                                                                                                    | The Middle East on the front page                    | Small  |
| **RP-5** | **`totalMatches` on `ChampionStatsResponse`**: the matches in the slice, each counted once, which `pickRate` already divides by. `totalGames` counts participants, and the front page divides it by ten (ADR-074, FIX-17).                                                                                                               | The games-analysed pill without arithmetic           | Small  |
| **RP-6** | **A time window on the champion analytics routes**, such as `days=7` or `days=30` on `/v1/lol/analytics/champions`: the rows over the matches played in the last N days, across patches, with the window echoed in the response. Today the only slices in time are one patch or `all` (`patch`), as the tables are aggregated per patch. | FP-10: 7D and 30D on the top-win-rate card (ADR-077) | Medium |

RP-1 is the one that changes the card most. RP-4 to RP-6 are not about this card; they are here so the list of what the front page is waiting on is in one place.

## Not known

- **The feed with something open has not been recorded.** Both status fixtures are synthetic (ADR-071). FP-04 assumes of `updates[]` only what Riot documents for lol-status-v4: `translations[]` like `titles[]`, a `publish` flag, `created_at` and `updated_at`. A recording the next time a region has an incident (`just fixture status-<platform> '/v1/lol/status/<platform>'`) would settle the order of `updates[]` and whether unpublished updates are ever in it.
- **Whether a closed entry stays in the feed** for a time (the synthetic fixture has a `complete` maintenance with a later `archive_at`). If it does, part of FP-06 needs no RP-3.

## Questions for the owner

1. Which of RP-1, RP-2 and RP-3 will riot-proxy take? FP-05 to FP-07 go into `docs/IMPLEMENTATION.md` only when their request is in a riot-proxy release, and FP-10 likewise with RP-6.
2. Is a link out to `status.riotgames.com` wanted? It is the site's first link to a page that is not its own. **Answered 2026-11-10: yes, the link is fine.**
3. A warning is now amber (`--color-warn`, new in `src/app.css`) and only a critical incident red. Before, every incident but a notice was red.
