import {
	parseItemCatalog,
	parseItemNames,
	parseKeyedNames,
	parseQueueNames,
	parseRunes,
	type StaticNames
} from '#lib/api/ddragon.ts';
import { toHttpError } from './errors.ts';
import { proxy, type ProxyClient } from './proxy.ts';

/** Plain fallbacks for when the lookups are unavailable: ids and names from the match. */
export const NO_NAMES: StaticNames = {
	champions: {},
	items: {},
	spells: {},
	queues: {},
	runes: {},
	itemCatalog: null
};

// Data Dragon files cannot change within a patch, and item.json alone is
// ~700 kB, so the reduced lookups are kept in memory (ADR-013). Two patches
// are held: the one pages use, and a new one loading before they switch to
// it (ADR-048). A third replaces the oldest.
export const HELD_PATCHES = 2;
const held = new Map<string, Promise<StaticNames>>();

export function staticNames(patch: string, client: ProxyClient = proxy): Promise<StaticNames> {
	const hit = held.get(patch);
	if (hit) return hit;

	const names = fetchNames(patch, client);
	keep(held, patch, names);
	return names;
}

/**
 * Holds `value` for `patch`, dropping the oldest patch past HELD_PATCHES.
 * A failure is not kept, so the next page tries again.
 */
export function keep<T>(map: Map<string, Promise<T>>, patch: string, value: Promise<T>): void {
	map.set(patch, value);
	for (const oldest of map.keys()) {
		if (map.size <= HELD_PATCHES) break;
		map.delete(oldest);
	}
	value.catch(() => {
		if (map.get(patch) === value) map.delete(patch);
	});
}

async function fetchNames(patch: string, client: ProxyClient): Promise<StaticNames> {
	const file = (file: 'champion' | 'item' | 'summoner' | 'runesReforged') =>
		client.GET('/v1/static/{file}', { params: { path: { file }, query: { version: patch } } });

	const [champions, items, spells, runes, queues] = await Promise.all([
		file('champion'),
		file('item'),
		file('summoner'),
		file('runesReforged'),
		client.GET('/v1/static/queues')
	]);
	for (const r of [champions, items, spells, runes, queues]) {
		if (!r.response.ok) toHttpError(r.response, r.error);
	}

	return {
		champions: parseKeyedNames(champions.data),
		items: parseItemNames(items.data),
		spells: parseKeyedNames(spells.data),
		queues: parseQueueNames(queues.data),
		runes: parseRunes(runes.data),
		itemCatalog: parseItemCatalog(items.data)
	};
}

/**
 * The lookups for a patch, or NO_NAMES if they are unavailable.
 * `fellBack` says which, for a page's `complete` flag.
 */
export async function namesOrFallback(
	patch: string,
	client: ProxyClient = proxy
): Promise<{ names: StaticNames; fellBack: boolean }> {
	try {
		return { names: await staticNames(patch, client), fellBack: false };
	} catch (e) {
		console.error('Data Dragon lookups unavailable; using fallbacks:', e);
		return { names: NO_NAMES, fellBack: true };
	}
}

/** For tests: forget the held patches. */
export function clearStaticNames(): void {
	held.clear();
}
