// Data Dragon's static JSON, as riot-proxy mirrors it at /v1/static/{file}
// and /v1/static/queues. Reduced to the lookups the site renders with.

export interface Named {
	/** Data Dragon id, used in image URLs: `Ahri`, `SummonerFlash`. */
	id: string;
	name: string;
}

export interface StaticNames {
	/** By numeric champion id (Data Dragon's `key`). */
	champions: Record<number, Named>;
	/** Item names by item id. */
	items: Record<number, string>;
	/** By numeric summoner spell id (Data Dragon's `key`). */
	spells: Record<number, Named>;
	/** Short queue names by queue id. */
	queues: Record<number, string>;
	/** Rune paths (styles) and runes by id; `icon` is a Data Dragon image path. */
	runes: Record<number, Rune>;
	/** What a build needs to know of each item; null without item.json. */
	itemCatalog: ItemCatalog | null;
}

/** One item as a build reads it (riot-proxy's BLD definitions). */
export interface ItemInfo {
	/** Purchasable, builds into nothing, at least 1500 gold, and not Boots, Consumable or Trinket. */
	finished: boolean;
	/** Tagged Boots. */
	boots: boolean;
	/** Tagged Trinket. */
	trinket: boolean;
	/** The items it is built from. */
	from: number[];
}

export type ItemCatalog = Record<number, ItemInfo>;

/** A finished item costs at least this much in total. */
const FINISHED_MIN_GOLD = 1500;

export interface Rune {
	name: string;
	icon: string;
}

/** champion.json or summoner.json: entries keyed by id, each with a numeric `key`. */
export function parseKeyedNames(body: unknown): Record<number, Named> {
	const out: Record<number, Named> = {};
	for (const [id, entry] of dataEntries(body)) {
		const { key, name } = entry as Record<string, unknown>;
		if (typeof key === 'string' && typeof name === 'string') out[Number(key)] = { id, name };
	}
	return out;
}

/** item.json: entries keyed by item id. */
export function parseItemNames(body: unknown): Record<number, string> {
	const out: Record<number, string> = {};
	for (const [id, entry] of dataEntries(body)) {
		const { name } = entry as Record<string, unknown>;
		if (typeof name === 'string') out[Number(id)] = name;
	}
	return out;
}

/** item.json as a build reads it. An entry whose id isn't a number is left out. */
export function parseItemCatalog(body: unknown): ItemCatalog {
	const out: ItemCatalog = {};
	for (const [id, entry] of dataEntries(body)) {
		if (!/^\d+$/.test(id)) continue;
		const { tags, gold, into, from } = entry as Record<string, unknown>;
		const tagList = Array.isArray(tags) ? tags : [];
		const tagged = (tag: string) => tagList.includes(tag);
		const { purchasable, total } = (gold ?? {}) as Record<string, unknown>;
		out[Number(id)] = {
			finished:
				purchasable === true &&
				!(Array.isArray(into) && into.length > 0) &&
				typeof total === 'number' &&
				total >= FINISHED_MIN_GOLD &&
				!tagged('Boots') &&
				!tagged('Consumable') &&
				!tagged('Trinket'),
			boots: tagged('Boots'),
			trinket: tagged('Trinket'),
			from: (Array.isArray(from) ? from : [])
				.filter((f): f is string => typeof f === 'string' && /^\d+$/.test(f))
				.map(Number)
		};
	}
	return out;
}

/**
 * queues.json: Riot's descriptions, shortened. `5v5 Ranked Solo games` becomes
 * `Ranked Solo`; with no description, the map name: `Custom games` → `Custom`.
 */
export function parseQueueNames(body: unknown): Record<number, string> {
	const out: Record<number, string> = {};
	if (!Array.isArray(body)) return out;
	for (const queue of body) {
		const { queueId, description, map } = (queue ?? {}) as Record<string, unknown>;
		const text = typeof description === 'string' ? description : map;
		if (typeof queueId === 'number' && typeof text === 'string') {
			out[queueId] = text.replace(/^\d+v\d+\s+/, '').replace(/\s+games$/i, '');
		}
	}
	return out;
}

/** runesReforged.json: the five paths, each with slots of runes. */
export function parseRunes(body: unknown): Record<number, Rune> {
	const out: Record<number, Rune> = {};
	const add = (value: unknown) => {
		const { id, name, icon } = (value ?? {}) as Record<string, unknown>;
		if (typeof id === 'number' && typeof name === 'string' && typeof icon === 'string') {
			out[id] = { name, icon };
		}
	};
	if (!Array.isArray(body)) return out;
	for (const style of body) {
		add(style);
		const slots = (style as { slots?: unknown })?.slots;
		for (const slot of Array.isArray(slots) ? slots : []) {
			const runes = (slot as { runes?: unknown })?.runes;
			for (const rune of Array.isArray(runes) ? runes : []) add(rune);
		}
	}
	return out;
}

function dataEntries(body: unknown): [string, unknown][] {
	if (typeof body !== 'object' || body === null || !('data' in body)) return [];
	const { data } = body;
	return typeof data === 'object' && data !== null
		? Object.entries(data).filter(([, v]) => typeof v === 'object' && v !== null)
		: [];
}
