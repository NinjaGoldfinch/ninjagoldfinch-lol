# Upgrade and rollback

How to deploy a new version of ninjagoldfinch.lol to production and how to go back to the previous one. The site has no database, migrations or bucket, so a rollback is a checkout, a rebuild and a restart; the things to watch are the edge cache and the riot-proxy version the site was built against.

## What a version is

A version is a commit of `main`. There are no release tags or artefacts; production builds from its checkout at `/opt/ninjagoldfinch-lol` (ADR-038, `docs/DECISIONS.md:500-516`). There is no CI and no GitHub Actions step anywhere in this path: every action below is manual (`CLAUDE.md:11-12`).

## Before upgrading

1. Note what is running now, so you can return to it:

   ```sh
   git -C /opt/ninjagoldfinch-lol log -1 --format='%h %s'
   ```

2. Check whether the change needs a newer riot-proxy. If the merged commits include a spec bump (`chore(api): riot-proxy spec v… from the release`), production riot-proxy must be at least that version first:

   ```sh
   git -C /opt/ninjagoldfinch-lol log --oneline HEAD..origin/main -- openapi/riot-proxy.json
   curl -s http://127.0.0.1:8080/openapi.json | sha256sum
   ```

   The second hash should equal `sha256sum openapi/riot-proxy.json` of the commit you are deploying; the committed file is kept byte-identical to what riot-proxy serves (`README.md:47-67`). Checked on 2026-10-20: a riot-proxy v2.7.0 binary serves `aafca901…088b8`, the same as the committed file. Upgrade riot-proxy first if they differ; riot-proxy upgrades by replacing its binary and restarting, with its migrations applied on boot (`riot-proxy:README.md:122`).

## Upgrade

Run on `ngf-prod-syd1` (`README.md:104-112`):

```sh
cd /opt/ninjagoldfinch-lol
sudo -H -u ninjagoldfinch-lol git fetch
sudo -H -u ninjagoldfinch-lol git pull
sudo -H -u ninjagoldfinch-lol pnpm install --frozen-lockfile
sudo -H -u ninjagoldfinch-lol env ORIGIN=https://ninjagoldfinch.lol pnpm build && sudo systemctl restart ninjagoldfinch-lol
```

Chain the build and the restart: adapter-node deletes and rewrites `build/` while the old process is still serving from it, so requests can fail until the restart ([workflows/release-process.md](../workflows/release-process.md#4-deploy-to-production)). If the build fails, `build/` may be gone or partial; do not restart onto it; fix or roll back first.

Then verify:

```sh
systemctl is-active ninjagoldfinch-lol
curl -s http://127.0.0.1:3000/healthz                                    # {"ok":true,"version":"…"}
curl -s -o /dev/null -w '%{http_code}\n' http://127.0.0.1:3000/champions # 200
sudo journalctl -u ninjagoldfinch-lol --since '-5 min' --no-pager
```

### What an upgrade resets

| State                     | Effect of the restart                                                                                                                                                                                                                                                                                         |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| In-memory holds           | Current patch, Data Dragon lookups and CommunityDragon shards are refetched at start-up by the `init` hook, without waiting, so early visitors do not wait for them; if that fails, the first page that needs them fetches them (`src/hooks.server.ts:11-13`, ADR-048, [data/caching.md](../data/caching.md)) |
| Edge cache                | Untouched. Pages rendered by the old build stay cached up to their `s-maxage` (profile 60 s, champions 600 s, match 1 day) plus `stale-while-revalidate` (`src/lib/server/cache.ts:5-16`)                                                                                                                     |
| riot-proxy quota window   | Untouched; it lives in riot-proxy (`riot-proxy:src/http/quota.rs:1-135`)                                                                                                                                                                                                                                      |
| Database, files, buckets  | None exist for the site                                                                                                                                                                                                                                                                                       |
| Visitors' recent searches | Untouched; they live in each browser's `localStorage` (`src/lib/recent-storage.ts:6-22`)                                                                                                                                                                                                                      |

## Roll back

1. Find the previous commit. `git pull` moved `HEAD`, so the reflog has it:

   ```sh
   sudo -H -u ninjagoldfinch-lol git -C /opt/ninjagoldfinch-lol reflog -n 5
   ```

2. Check it out detached, reinstall its exact dependencies, rebuild and restart:

   ```sh
   cd /opt/ninjagoldfinch-lol
   sudo -H -u ninjagoldfinch-lol git checkout --detach <previous-sha>
   sudo -H -u ninjagoldfinch-lol pnpm install --frozen-lockfile
   sudo -H -u ninjagoldfinch-lol env ORIGIN=https://ninjagoldfinch.lol pnpm build && sudo systemctl restart ninjagoldfinch-lol
   ```

   `--frozen-lockfile` installs the older commit's `pnpm-lock.yaml` exactly, so dependency changes roll back too.

3. Verify as after an upgrade.

4. Fix forward on a branch. When the fix is merged, return the checkout to `main` before the next deploy, or `git pull` will fail on a detached `HEAD`:

   ```sh
   sudo -H -u ninjagoldfinch-lol git -C /opt/ninjagoldfinch-lol checkout main
   ```

A rollback takes as long as `pnpm install` plus `pnpm build`. Measured on a 4-core development machine on 2026-10-20 (not the production host): `pnpm build` 2.9 s, `pnpm install --frozen-lockfile` 0.1 s with the packages already in pnpm's store; an install that must download packages takes longer.

### If bad pages were cached at the edge

A rollback does not remove pages the bad version rendered from Cloudflare's cache. Most expire within minutes, but match pages are cached for a day and may be served stale for another (`src/lib/server/cache.ts:8-9`). Purge them in the Cloudflare dashboard (the zone's Caching → Configuration → Purge Cache), by URL or everything. Error responses are never cached, except 404s for 60 s (`src/hooks.server.ts:18-29`, `src/lib/server/cache.ts:12-13,29-34`).

## riot-proxy upgrades and rollbacks

The site depends on riot-proxy's routes and fields at the committed spec's version ([integration/contract.md](../integration/contract.md)):

- **riot-proxy upgrade, site unchanged:** safe while riot-proxy keeps the routes and fields the site reads. riot-proxy's CI and release workflows build and publish binaries on GitHub; installing one on the host is manual (`riot-proxy:.github/workflows/release.yml`; [integration/environments.md](../integration/environments.md)).
- **riot-proxy rollback below the site's spec version:** the site may request fields or query parameters the older riot-proxy lacks. Roll the site back to a commit whose `openapi/riot-proxy.json` matches, or keep riot-proxy at the newer version.
- The site does not need restarting when riot-proxy restarts: the client keeps no session with riot-proxy, so requests after the restart succeed. During riot-proxy's restart, data pages answer 503 and `/healthz` stays 200 (observed against a stopped local riot-proxy is in [operations/troubleshooting.md](../operations/troubleshooting.md)).

## Not applicable

- **Migrations:** none; the site has no store ([data/caching.md](../data/caching.md)).
- **Object storage:** the site reads and writes no bucket ([integration/object-storage.md](../integration/object-storage.md)).
- **Blue/green or zero-downtime:** not set up; one process, restarted in place.

---

**Sources:** `README.md:L47-L67,L104-L114`, `CLAUDE.md:L11-L12`, `docs/DECISIONS.md:L500-L516,L684-L715`, `src/lib/server/cache.ts:L5-L34`, `src/hooks.server.ts:L11-L29`, `src/lib/recent-storage.ts:L6-L22`, `node_modules/@sveltejs/adapter-node/index.js:L17`, `riot-proxy:README.md:L122`, `riot-proxy:src/http/quota.rs:L1-L135`, `riot-proxy:.github/workflows/release.yml`
**Last verified:** 2026-11-03 against commit `a6b406b`
