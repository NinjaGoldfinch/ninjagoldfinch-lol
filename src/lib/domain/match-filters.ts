/**
 * Queues the profile's filter offers, in this order. Custom games (queue 0)
 * are never offered: Riot policy keeps them private without an opt-in.
 */
export const FILTER_QUEUES: readonly number[] = [420, 440, 400, 490, 480, 450, 1700];

export const MATCHES_PER_PAGE = 10;
/** riot-proxy accepts `start` up to 10000. */
export const MAX_PAGE = 10000 / MATCHES_PER_PAGE + 1;

export interface MatchFilter {
	queue: number | null;
	/** 1-based. */
	page: number;
}

/** Reads `?queue=420&page=2`; anything not offered or out of range is ignored. */
export function parseMatchFilter(params: URLSearchParams): MatchFilter {
	const queue = Number(params.get('queue') || NaN);
	const page = Number(params.get('page') || 1);
	return {
		queue: FILTER_QUEUES.includes(queue) ? queue : null,
		page: Number.isInteger(page) && page >= 1 && page <= MAX_PAGE ? page : 1
	};
}

/** The query string for a filter, leaving out defaults: `?queue=420&page=2`, or `` for all. */
export function filterQuery(filter: MatchFilter): string {
	const params = new URLSearchParams();
	if (filter.queue !== null) params.set('queue', String(filter.queue));
	if (filter.page > 1) params.set('page', String(filter.page));
	const query = params.toString();
	return query ? `?${query}` : '';
}

/**
 * A form action's URL that keeps the filter. SvelteKit reads the action from a
 * search param starting with `/`: `?queue=420&/refresh`, or `?/refresh`.
 */
export function actionUrl(filter: MatchFilter, action: string): string {
	const query = filterQuery(filter);
	return query ? `${query}&/${action}` : `?/${action}`;
}
