# Build fixtures

Copied unchanged from riot-proxy's `tests/fixtures/builds/` at c44ddf6, for
`playerBuild` (P3-05). They are raw documents, not recorded proxy responses,
so the mock proxy doesn't serve them.

| File                          | What it is                                                                                               |
| ----------------------------- | -------------------------------------------------------------------------------------------------------- |
| `OC1_711969250.timeline.json` | a real OC1 ranked solo timeline (patch 16.19), puuids replaced with `bld-fixture-puuid-NN`               |
| `item-16.19.1.json`           | Data Dragon 16.19.1's `item.json`, cut down to `name`, `gold`, `into`, `from` and `tags`                 |
| `OC1_711969250.expected.json` | riot-proxy's golden builds, per puuid: `starter`, `boots`, `items`, `skills` (first 15) and `skillOrder` |

The golden file was worked out by riot-proxy from its build definitions. If a
definition changes there, copy the new files here.
