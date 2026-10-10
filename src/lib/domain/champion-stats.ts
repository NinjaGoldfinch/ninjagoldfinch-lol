import type { components } from '#lib/api/schema.d.ts';
import type { StaticNames } from '#lib/api/ddragon.ts';

type ChampionStatsResponse = components['schemas']['ChampionStatsResponse'];
type AnalyticsPatchesResponse = components['schemas']['AnalyticsPatchesResponse'];

/**
 * The patch the champion pages show when the URL names none. `all` sums every
 * patch riot-proxy has aggregated; `newest` is its newest patch. One switch,
 * so it can be flipped once the newest patch holds enough games. ADR-033.
 */
export const DEFAULT_PATCH: 'all' | 'newest' = 'all';

/** The queue the champion pages read. */
export const ANALYTICS_QUEUE = 'RANKED_SOLO_5x5';

/** Roles by URL value, with riot-proxy's name and the label shown. */
export const ROLES = [
	{ slug: 'top', proxy: 'TOP', label: 'Top' },
	{ slug: 'jungle', proxy: 'JUNGLE', label: 'Jungle' },
	{ slug: 'mid', proxy: 'MIDDLE', label: 'Mid' },
	{ slug: 'bot', proxy: 'BOTTOM', label: 'Bot' },
	{ slug: 'support', proxy: 'UTILITY', label: 'Support' }
] as const;

export type RoleSlug = (typeof ROLES)[number]['slug'];

/** `major.minor`, as riot-proxy names an aggregated patch. */
const PATCH = /^\d+\.\d+$/;

export interface ChampionFilter {
	/** null for every role summed. */
	role: RoleSlug | null;
	/** `all`, a `major.minor`, or null for riot-proxy's newest patch. */
	patch: string | null;
}

/** The patch the URL means when it names none, as a filter value. */
function defaultPatch(): string | null {
	return DEFAULT_PATCH === 'all' ? 'all' : null;
}

/**
 * Reads `?role=mid&patch=16.19`. `patch=newest` is riot-proxy's newest patch;
 * anything not offered falls back to the default.
 */
export function parseChampionFilter(params: URLSearchParams): ChampionFilter {
	const role = ROLES.find((r) => r.slug === params.get('role'))?.slug ?? null;
	const patch = params.get('patch');
	return {
		role,
		patch:
			patch === 'newest'
				? null
				: patch === 'all' || (patch !== null && PATCH.test(patch))
					? patch
					: defaultPatch()
	};
}

/**
 * The query string for a filter and sort, leaving out defaults:
 * `?role=mid&patch=16.19&sort=win`, or ``.
 */
export function championQuery(filter: ChampionFilter, sort: ChampionSort = DEFAULT_SORT): string {
	const params = new URLSearchParams();
	if (filter.role !== null) params.set('role', filter.role);
	if (filter.patch !== defaultPatch()) params.set('patch', filter.patch ?? 'newest');
	if (sort !== DEFAULT_SORT) params.set('sort', sort);
	const query = params.toString();
	return query ? `?${query}` : '';
}

/** riot-proxy's query for a filter. `limit` is its most, so every champion is listed. */
export function proxyQuery(filter: ChampionFilter) {
	const role = ROLES.find((r) => r.slug === filter.role)?.proxy;
	return {
		queue: ANALYTICS_QUEUE,
		...(filter.patch !== null && { patch: filter.patch }),
		...(role && { role }),
		limit: 500
	};
}

/** One champion's line in the table. Rates are 0–1; null when riot-proxy has none. */
export interface ChampionRow {
	id: number;
	/** Data Dragon id, for the icon; null when the lookups lack it. */
	key: string | null;
	name: string;
	games: number;
	winRate: number;
	pickRate: number | null;
	banRate: number | null;
}

export interface ChampionTable {
	/** The patch the rows are for: `all` or a `major.minor`. */
	patch: string | null;
	totalGames: number;
	computedAt: string | null;
	/** Most played first, as riot-proxy returns them. */
	rows: ChampionRow[];
}

/**
 * riot-proxy's summed rows (no tier: one per champion), named for the page.
 * A row with a tier would be one tier's share only, so any are left out.
 */
export function toChampionTable(body: ChampionStatsResponse, names: StaticNames): ChampionTable {
	return {
		patch: body.patch,
		totalGames: body.totalGames,
		computedAt: body.computedAt,
		rows: body.champions
			.filter((c) => c.tier === null)
			.map((c) => ({
				id: c.championId,
				key: names.champions[c.championId]?.id ?? null,
				name: names.champions[c.championId]?.name ?? c.championName ?? `Champion ${c.championId}`,
				games: c.games,
				winRate: c.winRate,
				pickRate: c.pickRate ?? null,
				banRate: c.banRate ?? null
			}))
	};
}

/** The patches to offer, newest first; empty when riot-proxy's list is unavailable. */
export function patchOptions(body: AnalyticsPatchesResponse | undefined): string[] {
	return (body?.patches ?? []).map((p) => p.patch).filter((p) => PATCH.test(p));
}

export const SORTS = ['pick', 'win', 'ban'] as const;
export type ChampionSort = (typeof SORTS)[number];
export const DEFAULT_SORT: ChampionSort = 'pick';

/** `?sort=win`; anything else is the default. */
export function parseSort(value: string | null): ChampionSort {
	return SORTS.find((s) => s === value) ?? DEFAULT_SORT;
}

/**
 * Highest first by the sorted rate. A missing rate goes last; ties go to the
 * champion with more games, then by name.
 */
export function sortRows(rows: ChampionRow[], sort: ChampionSort): ChampionRow[] {
	const rate = (row: ChampionRow) =>
		sort === 'win' ? row.winRate : sort === 'pick' ? row.pickRate : row.banRate;
	return rows.toSorted(
		(a, b) => (rate(b) ?? -1) - (rate(a) ?? -1) || b.games - a.games || a.name.localeCompare(b.name)
	);
}

/** `51.3%`; `–` when there is no rate. */
export function formatRate(rate: number | null): string {
	return rate === null ? '–' : `${(rate * 100).toFixed(1)}%`;
}
