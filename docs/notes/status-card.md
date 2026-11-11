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

With riot-proxy's answer (below): the rows come from one `GET /v1/lol/status` call and are rendered in its order, not from a list in the site. Only platforms the site has a region for are shown; riot-proxy also polls `ph2` and `th2`, which have none, and those are left out and logged (owner, 2026-11-11). A platform that is `available: false` (`tw2` may always be) is shown as unavailable, never as all clear, and never fails the card. A 503 from the route means riot-proxy's poller is off: no rows, the picked region's own status still shown.

The site will not build this from the route it has: fourteen calls per uncached view inside the front page's 2 s deadline, fourteen counts against the site key's quota, and one failing platform would send `/` out as `no-store` (ADR-072).

### FP-06: recently closed (needs RP-3)

With nothing open: "Last incident: Ranked queues disabled · closed 2 days ago". The pass-through shows only what Riot lists now. Planned in riot-proxy as SITE-15, not built (below).

### FP-07: generated types replace the parsers (needs RP-2)

`parseStatus` goes; the generated types are used as for every other route (ADR-071 expected this). Waits for riot-proxy's SITE-16 (below); until then the hand parser stays.

## Requests for riot-proxy

Each is riot-proxy's own task. The shapes are suggestions: the site builds only on what `openapi/riot-proxy.json` says once a release has it.

| Label    | Change in riot-proxy                                                                                                                                                                                                                                                                                                 | Unlocks                                    | Size   |
| -------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------ | ------ |
| **RP-1** | **Every platform's status in one call**, such as `GET /v1/lol/status`: per platform, the number of open incidents and of open maintenances, the worst `incident_severity`, and how long ago riot-proxy read it from Riot. Typed in the spec. A platform whose read failed is reported as such, not as a failed call. | FP-05                                      | Medium |
| **RP-2** | **A schema for the 200 body** of `/v1/lol/status/{platform}` (the site no longer reads `/v1/lol/rotations/{platform}`, ADR-076): today `application/json: {}`, so the generated type is `unknown`. The fields the site reads are in `docs/integration/contract.md`, "Fields the site reads".                         | FP-07                                      | Small  |
| **RP-3** | **Entries riot-proxy saw close**: an incident or maintenance that has left Riot's feed, kept for some days with when it was last seen. riot-proxy would have to read each platform's feed on its own timer for this, not only when asked. Served on RP-1's route, or on one of its own.                              | FP-06                                      | Medium |
| **RP-4** | **`me1` accepted** wherever a platform is. riot-proxy 2.10.0 answers 400 for it, so the Middle East is left out of the front page's picker (ADR-072).                                                                                                                                                                | The Middle East on the front page          | Small  |
| **RP-5** | **`totalMatches` on `ChampionStatsResponse`**: the matches in the slice, each counted once, which `pickRate` already divides by. `totalGames` counts participants, and the front page divides it by ten (ADR-074, FIX-17).                                                                                           | The games-analysed pill without arithmetic | Small  |

RP-1 is the one that changes the card most. RP-4 and RP-5 are not about this card; they are here so the list of what the front page is waiting on is in one place.

## riot-proxy's answers (2026-11-11)

riot-proxy answered RP-1 to RP-5 in four pull requests: NinjaGoldfinch/riot-proxy #280 (the plan, docs only), #281 (RP-5), #282 (a status poller) and #283 (RP-1, on the poller). None is merged, and riot-proxy's latest release is still v2.10.0. The owner merges them and cuts one release with all three features. **Until that release, the site builds nothing on them**: `openapi/riot-proxy.json` is copied from the release's `docs/api/openapi.json`, not from a pull request, and where the released spec differs from what follows, the spec wins.

| Label    | Answer                                                                                                                                                                                                                                                                            | riot-proxy   | Site work once released                                      |
| -------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------ | ------------------------------------------------------------ |
| **RP-1** | `GET /v1/lol/status`, every polled platform in one call, typed (`StatusSummary`, `PlatformSummary`, `Severity`). Read from what a poller stores every `STATUS_POLL_INTERVAL_S` (300 s by default), never from Riot, so well inside the 2 s deadline; one count against the quota. | #282, #283   | FP-05                                                        |
| **RP-2** | Not started. riot-proxy types a field only when it is both in Riot's developer portal and in a recorded body, and there is no recording yet.                                                                                                                                      | SITE-16      | FP-07 waits                                                  |
| **RP-3** | Planned, not built: `recentlyClosed[]` on each `GET /v1/lol/status` entry, kept 7 days. Field names may change.                                                                                                                                                                   | SITE-15      | FP-06 waits                                                  |
| **RP-4** | Done: `me1` ("Middle East", match region `europe`, ids `ME1_…`) on every platform route. In the next release.                                                                                                                                                                     | #267 (ME-02) | The Middle East back in the front page's picker (ADR-072)    |
| **RP-5** | `ChampionStatsResponse.totalMatches`, on the champions route only: the matches in the slice, each counted once, the denominator of every row's `pickRate` and `banRate`.                                                                                                          | #281         | The pill reads it; `gamesAnalysed` and ADR-074's division go |

RP-6 (7D and 30D) is not among the answers: it was written after the requests went over (ADR-077, in #152). The owner raises it with riot-proxy.

### RP-5 in detail

- `totalMatches` is always present. Without `tier`, every match in the slice (platform, queue, patch); with `minTier`, the matches with a player at or above it; with `tier`, the matches with a player at it. It covers every role and side, `limit` and `minGames` do not change it, and it is 0 when there is no patch.
- `totalGames` is unchanged: the participant games over the rows _returned_, after `limit` and `minGames`. Dividing it by ten (ADR-074) depends on both and only approximates matches, so it goes.
- The pill keeps reading the default slice, with its own call when the top-win-rate card is filtered (ADR-077, in #152): it shows that call's `totalMatches`.
- The champions routes' `ETag`s change once with the new shape; cached copies are fetched again once.

### RP-1 in detail

```json
{
	"platforms": [
		{
			"platform": "euw1",
			"available": true,
			"error": null,
			"incidents": 2,
			"maintenances": 1,
			"worstSeverity": "critical",
			"maintenanceInProgress": true,
			"fetchedAgeSeconds": 41
		},
		{
			"platform": "tw2",
			"available": false,
			"error": "NOT_FOUND: Resource not found upstream",
			"incidents": null,
			"maintenances": null,
			"worstSeverity": null,
			"maintenanceInProgress": null,
			"fetchedAgeSeconds": null
		}
	]
}
```

The `tw2` entry is riot-proxy's made-up example of an unavailable platform, not something seen live.

- **Platforms:** one entry per polled platform, in riot-proxy's order: `na1 br1 la1 la2 euw1 eun1 tr1 ru me1 kr jp1 oc1 ph2 sg2 th2 tw2 vn2` (17 by default). Every field is always present, `null` where it does not apply.
- **`available`:** true when riot-proxy has stored a 200 for the platform and no read has failed since. Otherwise `error` says why (riot-proxy's code and message, or `"not read yet"` just after a deploy), and the counts and flags are `null`. `fetchedAgeSeconds` can still be set: the age of the last good read. One failed platform never fails the call.
- **`incidents`:** entries in Riot's `incidents[]`. **`maintenances`:** entries in `maintenances[]` but `complete` ones; one with no status counts.
- **`worstSeverity`:** the worst `incident_severity` of the incidents (critical > warning > info), else `null`; maintenances are not counted (an open question for the owner in riot-proxy), and an unknown value is ignored. **`maintenanceInProgress`:** any maintenance `in_progress`.
- **Headers:** `X-Cache: HIT`; `X-Cache-Fetched-Age`, the age of the stalest _available_ platform, left out when none is; `X-Request-Id` and `X-RateLimit-*`; no `X-Cache-Age`.
- **Responses:** 200, 401, 403, 429, 503. A 503 means the poller is off (`STATUS_POLL_PLATFORMS=none`); its code is `NOT_FOUND` with no `Retry-After`, and riot-proxy's owner may change that. The site treats any 503 as no rows, and does not retry.
- **Fixtures for FP-05**, all synthetic: the example above, plus an all-clear platform, a `"not read yet"` platform and a permanently unavailable `tw2`.

### What changes for the route the card already reads

`GET /v1/lol/status/{platform}` is now cached 300 s soft and 600 s hard (it was 60 s and 240 s), and the poller keeps it warm, so it normally answers `X-Cache: HIT` with `X-Cache-Fetched-Age` under 300. Its body can be up to about five minutes old, ten at worst. The card already says so ("checked 4 minutes ago", ADR-071); nothing on it claims to be live to the second. The body is still Riot's, passed through.

### What riot-proxy found about Riot's payloads (for SITE-16)

- **lol-status-v4**, from the developer portal on 2026-11-10: `PlatformDataDto` (`id`, `name`, `locales`, `maintenances`, `incidents`), `StatusDto` (`id`, `maintenance_status`, `incident_severity`, `titles`, `updates`, `created_at`, `archive_at`, `updated_at`, `platforms`), `ContentDto` (`locale`, `content`) and `UpdateDto` (`id`, `author`, `publish`, `publish_locations`, `translations`, `created_at`, `updated_at`). These agree with what `parseStatus` reads.
- **champion-v3 rotations:** the portal now lists `newplayer` and `sr`, where v1's example and riot-proxy's showcase have `freeChampionIds`, `freeChampionIdsForNewPlayers` and `maxNewPlayerLevel`. The site no longer reads the rotations route (ADR-076), so this does not affect it.

## Not known

- **The feed with something open has not been recorded.** Both status fixtures are synthetic (ADR-071). FP-04 assumes of `updates[]` only what Riot documents for lol-status-v4: `translations[]` like `titles[]`, a `publish` flag, `created_at` and `updated_at`. A recording the next time a region has an incident (`just fixture status-<platform> '/v1/lol/status/<platform>'`) would settle the order of `updates[]` and whether unpublished updates are ever in it.
- **Whether a closed entry stays in the feed** for a time (the synthetic fixture has a `complete` maintenance with a later `archive_at`). If it does, part of FP-06 needs no RP-3. riot-proxy's poller will show it.
- **A recording is possible, not yet made.** riot-proxy's poller saves a copy of any status body that lists an incident when `STATUS_RECORDINGS_DIR` is set, with the key replaced by `[REDACTED]`. The owner has to turn it on in staging and wait for a real incident; until then both status fixtures stay synthetic.
- **Riot facts nobody has checked:** whether lol-status calls count against the app rate limit, and whether `tw2` serves lol-status at all (the developer portal leaves it out of lol-status-v4's regions).

## Questions for the owner

1. Which of RP-1, RP-2 and RP-3 will riot-proxy take? FP-05 to FP-07 go into `docs/IMPLEMENTATION.md` only when their request is in a riot-proxy release. **Answered 2026-11-11: all of them, RP-1 first (above). FP-05 and the RP-4 and RP-5 work go into the plan with the release; FP-06 and FP-07 when SITE-15 and SITE-16 ship.**
2. Is a link out to `status.riotgames.com` wanted? It is the site's first link to a page that is not its own. **Answered 2026-11-10: yes, the link is fine.**
3. A warning is now amber (`--color-warn`, new in `src/app.css`) and only a critical incident red. Before, every incident but a notice was red.
