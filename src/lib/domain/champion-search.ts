import type { Named } from '#lib/api/ddragon.ts';

// Finding a champion by name, as riot-proxy's showcase does (SITE-10):
// names compare lower-cased with accents, spaces and punctuation dropped,
// on the display name and on Data Dragon's id. ADR-034.

/** A name as the search compares it: `Kai'Sa`, `kaisa` and `KAI SA` are all `kaisa`. */
export function champKey(name: string): string {
	return name
		.normalize('NFD')
		.toLowerCase()
		.replace(/[^\p{L}\p{N}]/gu, '');
}

/** A champion page's URL segment: Data Dragon's id, lower-cased (`monkeyking`). */
export function championSlug(champion: Named): string {
	return champion.id.toLowerCase();
}

export function championPath(champion: Named): string {
	return `/champions/${encodeURIComponent(championSlug(champion))}`;
}

export interface FoundChampion {
	championId: number;
	champion: Named;
}

type Search = FoundChampion | { championId: null; matches: string[] };

/**
 * The champion a search names: an exact match on the display name or Data
 * Dragon id first (`Vi` is Vi, not Viego), else a unique prefix (`kais` is
 * Kai'Sa). Otherwise every name it is a prefix of, sorted: none, or two or more.
 */
export function findChampion(champions: Record<number, Named>, query: string): Search {
	const q = champKey(query);
	if (!q) return { championId: null, matches: [] };
	const all = Object.entries(champions).map(([id, champion]) => ({
		championId: Number(id),
		champion,
		keys: [champKey(champion.name), champKey(champion.id)].filter(Boolean)
	}));
	const exact = all.find((c) => c.keys.includes(q));
	if (exact) return { championId: exact.championId, champion: exact.champion };
	const prefix = all.filter((c) => c.keys.some((k) => k.startsWith(q)));
	if (prefix.length === 1)
		return { championId: prefix[0].championId, champion: prefix[0].champion };
	return {
		championId: null,
		matches: prefix.map((c) => c.champion.name).sort((a, b) => a.localeCompare(b))
	};
}

/** What the search says when it finds no single champion. */
export function searchHint(query: string, matches: string[]): string {
	if (matches.length === 0) return `No champion matches '${query}'. A Riot ID needs its #TAG.`;
	const more = matches.length - 5;
	const shown = matches.slice(0, 5).join(', ') + (more > 0 ? ` and ${more} more` : '');
	return `'${query}' matches ${shown}. Keep typing.`;
}

/** Every champion's display name, sorted: the search box's suggestions. */
export function championNames(champions: Record<number, Named>): string[] {
	return Object.values(champions)
		.map((c) => c.name)
		.sort((a, b) => a.localeCompare(b));
}
