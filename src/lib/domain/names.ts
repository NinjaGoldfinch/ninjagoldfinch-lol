import type { StaticNames } from '#lib/api/ddragon.ts';

// What to call an item, queue or champion when the Data Dragon lookups
// lack it (or are unavailable: NO_NAMES).

/** An item's name, or `Item 3089`. */
export function itemName(names: Pick<StaticNames, 'items'>, id: number): string {
	return names.items[id] ?? `Item ${id}`;
}

/** A queue's short name, `Queue 1700` for one the lookups lack, `Unknown queue` without an id. */
export function queueName(names: Pick<StaticNames, 'queues'>, queueId: number | null): string {
	return queueId === null ? 'Unknown queue' : (names.queues[queueId] ?? `Queue ${queueId}`);
}

/** A champion's name: Data Dragon's, else riot-proxy's `fallback`, else `Champion 103`. */
export function championName(
	names: Pick<StaticNames, 'champions'>,
	id: number,
	fallback?: string | null
): string {
	return names.champions[id]?.name ?? fallback ?? `Champion ${id}`;
}
