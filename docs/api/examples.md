# Examples

Copy-paste curl walkthroughs for the common tasks, run against a local production build that talks to the mock proxy. Each output below is what the commands printed on 2026-10-19 at commit `e7c395c`.

## Start a local instance

From the repo root, in two terminals. The mock proxy replays `tests/fixtures/`, so nothing reaches riot-proxy or Riot.

```sh
# terminal 1: the mock riot-proxy on port 8787
node tests/mock-proxy/server.ts 8787
```

```sh
# terminal 2: build with the origin baked in, then run the production server
ORIGIN=http://localhost:4173 pnpm build
env ORIGIN=http://localhost:4173 PORT=4173 HOST=127.0.0.1 NODE_ENV=production \
  PROXY_URL=http://127.0.0.1:8787 PROXY_KEY=placeholder \
  CDRAGON_URL=http://127.0.0.1:8787 node build
```

Against a real riot-proxy, set `PROXY_URL` and `PROXY_KEY` to its address and your key instead. Only paths the fixtures recorded work against the mock; anything else is a 500 from the mock and a 503 page from the site (`tests/mock-proxy/mock.ts:27-48`).

```sh
B=http://localhost:4173
```

## 1. Is it up?

```sh
curl -s $B/healthz
```

```text
{"ok":true,"version":"0.0.1"}
```

## 2. Find a player

The search box submits `q`. A Riot ID redirects to the profile without calling riot-proxy.

```sh
curl -s -o /dev/null -w '%{http_code} %{redirect_url}\n' "$B/search?q=NinjaGoldfinch%23OCENZ"
curl -sL "$B/search?q=NinjaGoldfinch%23OCENZ" | grep -o '<h1[^>]*>[^<]*' | head -1
```

```text
303 http://localhost:4173/summoner/NinjaGoldfinch-OCENZ
<h1 class="text-2xl font-semibold [overflow-wrap:anywhere]">NinjaGoldfinch
```

## 3. Filter and page a match history

```sh
curl -s "$B/summoner/NinjaGoldfinch-OCENZ?queue=420" | grep -o 'Page [0-9]*' | head -1
curl -s "$B/summoner/NinjaGoldfinch-OCENZ?page=2" | grep -o '>Newer<\|>Older<' | tr '\n' ' '; echo
```

```text
Page 1
>Newer< >Older<
```

Empty or default values redirect to the clean URL:

```sh
curl -s -o /dev/null -w '%{http_code} %{redirect_url}\n' "$B/summoner/NinjaGoldfinch-OCENZ?queue=&champion=&page=1"
```

```text
307 http://localhost:4173/summoner/NinjaGoldfinch-OCENZ
```

## 4. Refresh a profile

A form POST from the site's own origin; any other origin is refused.

```sh
curl -s -X POST -H "Origin: $B" -H 'content-type: application/x-www-form-urlencoded' \
  -o /dev/null -w '%{http_code}\n' "$B/summoner/NinjaGoldfinch-OCENZ?/refresh"
curl -s -X POST -H 'Origin: https://example.org' -H 'content-type: application/x-www-form-urlencoded' \
  -o /dev/null -w '%{http_code}\n' "$B/summoner/NinjaGoldfinch-OCENZ?/refresh"
```

```text
200
403
```

## 5. Open a match

```sh
curl -s "$B/match/OC1_712351051" | grep -o '<h1[^>]*>[^<]*' | head -1
curl -s -o /dev/null -w '%{http_code} %{redirect_url}\n' "$B/match/oce/OC1_712351051?player=NinjaGoldfinch-OCENZ"
curl -s -o /dev/null -w '%{http_code}\n' "$B/match/XX9_1"
```

```text
<h1 class="text-2xl font-semibold">Ranked Solo
308 http://localhost:4173/match/OC1_712351051?player=NinjaGoldfinch-OCENZ
404
```

The second is an old URL with a region; the third names no known platform, so it is a 404 without asking riot-proxy.

## 6. Champion analytics

```sh
curl -s -o /dev/null -w '%{http_code} %{redirect_url}\n' "$B/champions?role=mid&patch=all&sort=pick"
curl -s -o /dev/null -w '%{http_code}\n' "$B/champions?role=mid"
curl -s -o /dev/null -w '%{http_code} %{redirect_url}\n' "$B/champions/Ahri?rank=emerald%2B"
curl -s -o /dev/null -w '%{http_code}\n' "$B/champions/ahri?rank=emerald+"
curl -s "$B/champions/ahri?vs=syndra" | grep -o 'against Syndra' | head -1
```

```text
307 http://localhost:4173/champions?role=mid
200
308 http://localhost:4173/champions/ahri?rank=emerald+
200
against Syndra
```

## 7. Page data as JSON

SvelteKit serves each page's load output at `<path>/__data.json` for client-side navigation. It is SvelteKit's internal format, not a public API.

```sh
curl -s "$B/summoner/NinjaGoldfinch-OCENZ/__data.json" | head -c 120; echo
```

```text
{"type":"data","nodes":[null,{"type":"data","data":[{"region":1,"riotId":4,"summoner":7,"ranks":10,"fetchedAgeSeconds":1
```

## 8. On production

On `ngf-prod-syd1` the site listens on `127.0.0.1:3000` (`README.md:100-102`):

```sh
curl -s http://127.0.0.1:3000/healthz
curl -sI https://ninjagoldfinch.lol/champions | grep -i '^cache-control\|^cf-cache-status'
```

The second shows the site's cache policy and, through Cloudflare, whether the edge served it. These two were not run for this document.

---

**Sources:** `tests/mock-proxy/server.ts:L1-L12`, `tests/mock-proxy/mock.ts:L27-L48`, `playwright.config.ts:L15-L31`, `README.md:L100-L102`; commands run 2026-10-19 against `node build` and the mock proxy
**Last verified:** 2026-10-19 against commit `85d9cf8`
