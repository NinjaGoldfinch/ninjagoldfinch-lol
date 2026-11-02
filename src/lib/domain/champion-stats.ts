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

/**
 * Games below which riot-proxy leaves a row out: none. Every row is shown,
 * and small ones are marked instead (LOW_SAMPLE_GAMES). Sent on every
 * analytics route, so riot-proxy's own default doesn't decide. ADR-035.
 */
export const MIN_GAMES = 0;

/** Games below which a rate is marked as a low sample. ADR-035. */
export const LOW_SAMPLE_GAMES = 100;

/** Whether a rate over this many games is a low sample. */
export function isLowSample(games: number): boolean {
	return games < LOW_SAMPLE_GAMES;
}

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

/** Riot's tiers by URL value, highest first, with riot-proxy's name and the label shown. */
export const TIERS = [
	{ slug: 'challenger', proxy: 'CHALLENGER', label: 'Challenger' },
	{ slug: 'grandmaster', proxy: 'GRANDMASTER', label: 'Grandmaster' },
	{ slug: 'master', proxy: 'MASTER', label: 'Master' },
	{ slug: 'diamond', proxy: 'DIAMOND', label: 'Diamond' },
	{ slug: 'emerald', proxy: 'EMERALD', label: 'Emerald' },
	{ slug: 'platinum', proxy: 'PLATINUM', label: 'Platinum' },
	{ slug: 'gold', proxy: 'GOLD', label: 'Gold' },
	{ slug: 'silver', proxy: 'SILVER', label: 'Silver' },
	{ slug: 'bronze', proxy: 'BRONZE', label: 'Bronze' },
	{ slug: 'iron', proxy: 'IRON', label: 'Iron' }
] as const;

export type TierSlug = (typeof TIERS)[number]['slug'];

/** One tier, or that tier and every tier above it. ADR-042. */
export interface RankFilter {
	tier: TierSlug;
	andAbove: boolean;
}

/** `diamond`, `diamond+`; a `+` left unencoded in a URL arrives as a space. */
const RANK = /^([a-z]+)([+ ])?$/;

/** `major.minor`, as riot-proxy names an aggregated patch. */
const PATCH = /^\d+\.\d+$/;

export interface ChampionFilter {
	/** null for every role summed. */
	role: RoleSlug | null;
	/** `all`, a `major.minor`, or null for riot-proxy's newest patch. */
	patch: string | null;
	/** null for every tier summed. */
	rank: RankFilter | null;
}

/** The patch the URL means when it names none, as a filter value. */
function defaultPatch(): string | null {
	return DEFAULT_PATCH === 'all' ? 'all' : null;
}

/**
 * Reads `?role=mid&rank=diamond+&patch=16.19`. `patch=newest` is riot-proxy's
 * newest patch; anything not offered falls back to the default.
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
					: defaultPatch(),
		rank: parseRank(params.get('rank'))
	};
}

/**
 * `diamond` is Diamond alone, `diamond+` Diamond and every tier above it.
 * Nothing is above Challenger, so `challenger+` is Challenger. Anything else
 * is every tier.
 */
function parseRank(value: string | null): RankFilter | null {
	const match = RANK.exec(value ?? '');
	const tier = TIERS.find((t) => t.slug === match?.[1])?.slug;
	if (!match || !tier) return null;
	return { tier, andAbove: match[2] !== undefined && tier !== 'challenger' };
}

/** `diamond+`, as the URL writes a rank. */
export function rankValue(rank: RankFilter): string {
	return `${rank.tier}${rank.andAbove ? '+' : ''}`;
}

/** `Diamond+`, `Diamond`, or `All tiers`. */
export function rankLabel(rank: RankFilter | null): string {
	if (!rank) return 'All tiers';
	const label = TIERS.find((t) => t.slug === rank.tier)?.label ?? rank.tier;
	return `${label}${rank.andAbove ? '+' : ''}`;
}

/** What a page's rates count: `every tier`, or `Diamond+` with a tier picked. */
export function rateScope(rank: RankFilter | null): string {
	return rank ? rankLabel(rank) : 'every tier';
}

/** `every region and tier`, or `every region · Diamond+`, for a page's scope line. */
export function rankScope(rank: RankFilter | null): string {
	return rank ? `every region · ${rankLabel(rank)}` : 'every region and tier';
}

/** The ranks a picker offers: each tier and above (Grandmaster+ to Iron+), then each tier alone. */
export const RANK_OPTIONS: { ranges: RankFilter[]; tiers: RankFilter[] } = {
	ranges: TIERS.filter((t) => t.slug !== 'challenger').map((t) => ({
		tier: t.slug,
		andAbove: true
	})),
	tiers: TIERS.map((t) => ({ tier: t.slug, andAbove: false }))
};

/**
 * The query string for a filter and sort, leaving out defaults:
 * `?role=mid&rank=diamond+&patch=16.19&sort=win`, or ``. A rank's `+` is
 * written as is, not as `%2B`, so the URL reads as the picker does.
 */
export function championQuery(filter: ChampionFilter, sort: ChampionSort = DEFAULT_SORT): string {
	const params = new URLSearchParams(filterFields(filter, sort));
	const query = params.toString().replace(/(^|&)rank=([a-z]+)%2B(?=&|$)/, '$1rank=$2+');
	return query ? `?${query}` : '';
}

/** The fields `championQuery` writes, unencoded: a form's hidden inputs keep the view. */
export function filterFields(
	filter: ChampionFilter,
	sort: ChampionSort = DEFAULT_SORT
): [string, string][] {
	const fields: [string, string][] = [];
	if (filter.role !== null) fields.push(['role', filter.role]);
	if (filter.rank !== null) fields.push(['rank', rankValue(filter.rank)]);
	if (filter.patch !== defaultPatch()) fields.push(['patch', filter.patch ?? 'newest']);
	if (sort !== DEFAULT_SORT) fields.push(['sort', sort]);
	return fields;
}

/**
 * riot-proxy's analytics query for a filter, keys in a fixed order (the mock
 * proxy matches recorded paths exactly). A rank is `tier` for one tier or
 * `minTier` for it and above, never both; without one, rows are summed over
 * every tier.
 */
export function analyticsQuery(filter: ChampionFilter, limit?: number) {
	const role = ROLES.find((r) => r.slug === filter.role)?.proxy;
	const tier = TIERS.find((t) => t.slug === filter.rank?.tier)?.proxy;
	return {
		queue: ANALYTICS_QUEUE,
		...(filter.patch !== null && { patch: filter.patch }),
		...(role && { role }),
		...(tier && (filter.rank?.andAbove ? { minTier: tier } : { tier })),
		minGames: MIN_GAMES,
		...(limit !== undefined && { limit })
	};
}

/** The table's query. `limit` is riot-proxy's most, so every champion is listed. */
export function proxyQuery(filter: ChampionFilter) {
	return analyticsQuery(filter, 500);
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
	/** In riot-proxy's order; the page sorts them itself. */
	rows: ChampionRow[];
}

/**
 * riot-proxy's summed rows, one per champion, named for the page. A summed
 * row carries the body's own `tier`: null over every tier or a range, the
 * tier when one was asked for. Any other row is one tier's share only, so
 * it is left out.
 */
export function toChampionTable(body: ChampionStatsResponse, names: StaticNames): ChampionTable {
	return {
		patch: body.patch,
		rows: body.champions
			.filter((c) => c.tier === body.tier)
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

const SORTS = ['pick', 'win', 'ban'] as const;
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

/** `All patches`, `Patch 16.19`, or `Newest patch` before riot-proxy names it. */
export function patchLabel(patch: string | null): string {
	return patch === 'all' ? 'All patches' : patch ? `Patch ${patch}` : 'Newest patch';
}

/** The patches a picker offers: riot-proxy's list, plus the one shown when the list lacks it. */
export function pickerPatches(shown: string | null, patches: string[]): string[] {
	return shown && shown !== 'all' && !patches.includes(shown) ? [shown, ...patches] : patches;
}
