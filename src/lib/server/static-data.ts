import {
	parseItemNames,
	parseKeyedNames,
	parseQueueNames,
	parseRunes,
	type StaticNames
} from '#lib/api/ddragon.ts';
import { toHttpError } from './errors.ts';
import { proxy } from './proxy.ts';

type ProxyClient = typeof proxy;

/** Plain fallbacks for when the lookups are unavailable: ids and names from the match. */
export const NO_NAMES: StaticNames = {
	champions: {},
	items: {},
	spells: {},
	queues: {},
	runes: {}
};

// Data Dragon files cannot change within a patch, and item.json alone is
// ~700 kB, so the reduced lookups for the current patch are kept in memory.
// Only one patch is held; a new patch replaces it. ADR-013.
let latest: { patch: string; names: Promise<StaticNames> } | undefined;

export function staticNames(patch: string, client: ProxyClient = proxy): Promise<StaticNames> {
	if (latest?.patch === patch) return latest.names;

	const names = fetchNames(patch, client);
	latest = { patch, names };
	// A failed fetch is not kept, so the next page tries again.
	names.catch(() => {
		if (latest?.names === names) latest = undefined;
	});
	return names;
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
		runes: parseRunes(runes.data)
	};
}

/** For tests: forget the held patch. */
export function clearStaticNames(): void {
	latest = undefined;
}
