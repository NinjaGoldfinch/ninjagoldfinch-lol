import { CDRAGON_URL } from '$app/env/private';
import { cdragonGameData } from '#lib/assets.ts';
import { parseStatShards, type Shard } from '#lib/api/cdragon.ts';
import { keep } from './static-data.ts';

// Stat shards are not in Data Dragon's runesReforged.json, and riot-proxy
// mirrors only Data Dragon, so their names and icons come from
// CommunityDragon's perks.json (ADR-026). Like the Data Dragon lookups
// (ADR-013, ADR-048), the reduced table is held in memory for two patches.
const held = new Map<string, Promise<Record<number, Shard>>>();

/** How long perks.json may take, body included. Every match page of the patch waits on it. */
export const CDRAGON_BUDGET_MS = 5_000;

export function statShards(
	patch: string,
	fetcher: typeof fetch = fetch,
	base: string = CDRAGON_URL
): Promise<Record<number, Shard>> {
	const hit = held.get(patch);
	if (hit) return hit;

	const deadline = new AbortController();
	const timer = setTimeout(
		() =>
			deadline.abort(new Error(`CommunityDragon perks.json: no answer in ${CDRAGON_BUDGET_MS} ms`)),
		CDRAGON_BUDGET_MS
	);
	const shards = fetcher(`${cdragonGameData(patch, base)}/perks.json`, { signal: deadline.signal })
		.then(async (response) => {
			if (!response.ok) throw new Error(`CommunityDragon perks.json: ${response.status}`);
			return parseStatShards(await response.json());
		})
		.finally(() => clearTimeout(timer));
	keep(held, patch, shards);
	return shards;
}

/** For tests: forget the held patches. */
export function clearStatShards(): void {
	held.clear();
}
