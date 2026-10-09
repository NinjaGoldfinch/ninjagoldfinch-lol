import { CDRAGON_URL } from '$app/env/private';
import { cdragonGameData } from '#lib/assets.ts';
import { parseStatShards, type Shard } from '#lib/api/cdragon.ts';

// Stat shards are not in Data Dragon's runesReforged.json, and riot-proxy
// mirrors only Data Dragon, so their names and icons come from
// CommunityDragon's perks.json (ADR-026). Like the Data Dragon lookups
// (ADR-013), the reduced table for one patch is held in memory.
let latest: { patch: string; shards: Promise<Record<number, Shard>> } | undefined;

export function statShards(
	patch: string,
	fetcher: typeof fetch = fetch,
	base: string = CDRAGON_URL
): Promise<Record<number, Shard>> {
	if (latest?.patch === patch) return latest.shards;

	const shards = fetcher(`${cdragonGameData(patch, base)}/perks.json`).then(async (response) => {
		if (!response.ok) throw new Error(`CommunityDragon perks.json: ${response.status}`);
		return parseStatShards(await response.json());
	});
	latest = { patch, shards };
	// A failed fetch is not kept, so the next page tries again.
	shards.catch(() => {
		if (latest?.shards === shards) latest = undefined;
	});
	return shards;
}

/** For tests: forget the held patch. */
export function clearStatShards(): void {
	latest = undefined;
}
