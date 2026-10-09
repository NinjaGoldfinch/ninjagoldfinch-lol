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

function dataEntries(body: unknown): [string, unknown][] {
	if (typeof body !== 'object' || body === null || !('data' in body)) return [];
	const { data } = body;
	return typeof data === 'object' && data !== null
		? Object.entries(data).filter(([, v]) => typeof v === 'object' && v !== null)
		: [];
}
