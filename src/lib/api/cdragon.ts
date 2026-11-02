// CommunityDragon's copy of the client's perks.json, reduced to the stat
// shards: the only perks Data Dragon's runesReforged.json leaves out.

import { record } from './json.ts';

export interface Shard {
	name: string;
	/** Path inside CommunityDragon's game data, for `statShardIconUrl`. */
	icon: string;
}

const ASSETS = '/lol-game-data/assets/v1/';

/**
 * Stat shards by perk id (5001–5013). CommunityDragon serves the client's
 * files with lower-case paths, so `iconPath` is lower-cased.
 */
export function parseStatShards(body: unknown): Record<number, Shard> {
	const out: Record<number, Shard> = {};
	for (const perk of Array.isArray(body) ? body : []) {
		const { id, name, iconPath } = record(perk) ?? {};
		if (
			typeof id === 'number' &&
			id >= 5000 &&
			id < 6000 &&
			typeof name === 'string' &&
			typeof iconPath === 'string' &&
			iconPath.startsWith(ASSETS)
		) {
			out[id] = { name, icon: iconPath.slice(ASSETS.length).toLowerCase() };
		}
	}
	return out;
}
