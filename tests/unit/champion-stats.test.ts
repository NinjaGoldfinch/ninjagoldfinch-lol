import { describe, expect, it } from 'vitest';
import type { components } from '#lib/api/schema.d.ts';
import {
	DEFAULT_PATCH,
	LOW_SAMPLE_GAMES,
	MIN_GAMES,
	isLowSample,
	championQuery,
	formatRate,
	parseChampionFilter,
	parseSort,
	RANK_OPTIONS,
	rankLabel,
	patchLabel,
	patchOptions,
	pickerPatches,
	analyticsQuery,
	proxyQuery,
	sortRows,
	toChampionTable,
	type ChampionRow
} from '#lib/domain/champion-stats.ts';
import { fixtureBody, recordedNames } from './fixtures.ts';

type Stats = components['schemas']['ChampionStatsResponse'];
type Patches = components['schemas']['AnalyticsPatchesResponse'];

const names = recordedNames();
const ALL = '/v1/lol/analytics/champions?queue=RANKED_SOLO_5x5&patch=all&minGames=0&limit=500';
const recorded = fixtureBody(ALL) as Stats;

const params = (query: string) => new URLSearchParams(query);

describe('parseChampionFilter', () => {
	it('defaults to every role on all patches', () => {
		expect(DEFAULT_PATCH).toBe('all');
		expect(parseChampionFilter(params(''))).toEqual({ role: null, patch: 'all', rank: null });
	});

	it('reads a role and a patch', () => {
		expect(parseChampionFilter(params('role=mid&patch=16.19'))).toEqual({
			role: 'mid',
			patch: '16.19',
			rank: null
		});
		expect(parseChampionFilter(params('patch=newest')).patch).toBeNull();
	});

	it('ignores what is not offered', () => {
		expect(parseChampionFilter(params('role=MIDDLE&patch=16.19.1'))).toEqual({
			role: null,
			patch: 'all',
			rank: null
		});
		expect(parseChampionFilter(params('patch=x')).patch).toBe('all');
	});

	it('reads one tier, or a tier and above', () => {
		expect(parseChampionFilter(params('rank=diamond')).rank).toEqual({
			tier: 'diamond',
			andAbove: false
		});
		// Encoded by a form as %2B; typed or linked as a bare +, which a query string reads as a space.
		for (const query of ['rank=diamond%2B', 'rank=diamond+']) {
			expect(parseChampionFilter(params(query)).rank).toEqual({ tier: 'diamond', andAbove: true });
		}
		expect(parseChampionFilter(params('rank=iron%2B')).rank).toEqual({
			tier: 'iron',
			andAbove: true
		});
	});

	it('reads Challenger and above as Challenger: nothing is above it', () => {
		expect(parseChampionFilter(params('rank=challenger%2B')).rank).toEqual({
			tier: 'challenger',
			andAbove: false
		});
	});

	it('reads an unknown or missing rank as every tier', () => {
		for (const query of ['', 'rank=', 'rank=DIAMOND', 'rank=unknown', 'rank=diamond++', 'rank=+']) {
			expect(parseChampionFilter(params(query)).rank).toBeNull();
		}
	});
});

describe('rankLabel and RANK_OPTIONS', () => {
	it('names a rank as the picker does', () => {
		expect(rankLabel(null)).toBe('All tiers');
		expect(rankLabel({ tier: 'diamond', andAbove: true })).toBe('Diamond+');
		expect(rankLabel({ tier: 'grandmaster', andAbove: false })).toBe('Grandmaster');
	});

	it('offers Grandmaster+ to Iron+, then every tier alone, highest first', () => {
		expect(RANK_OPTIONS.ranges.map(rankLabel)).toEqual([
			'Grandmaster+',
			'Master+',
			'Diamond+',
			'Emerald+',
			'Platinum+',
			'Gold+',
			'Silver+',
			'Bronze+',
			'Iron+'
		]);
		expect(RANK_OPTIONS.tiers.map(rankLabel)).toEqual([
			'Challenger',
			'Grandmaster',
			'Master',
			'Diamond',
			'Emerald',
			'Platinum',
			'Gold',
			'Silver',
			'Bronze',
			'Iron'
		]);
	});
});

describe('championQuery', () => {
	it('leaves out defaults', () => {
		expect(championQuery({ role: null, patch: 'all', rank: null })).toBe('');
		expect(championQuery({ role: null, patch: 'all', rank: null }, 'pick')).toBe('');
	});

	it('names the role, a patch other than the default, and the sort', () => {
		expect(championQuery({ role: 'support', patch: '16.19', rank: null }, 'ban')).toBe(
			'?role=support&patch=16.19&sort=ban'
		);
		expect(championQuery({ role: null, patch: null, rank: null })).toBe('?patch=newest');
	});

	it('writes a rank after the role, its + as is', () => {
		const rank = { tier: 'emerald', andAbove: true } as const;
		expect(championQuery({ role: 'mid', patch: '16.19', rank }, 'win')).toBe(
			'?role=mid&rank=emerald+&patch=16.19&sort=win'
		);
		expect(championQuery({ role: null, patch: 'all', rank: { ...rank, andAbove: false } })).toBe(
			'?rank=emerald'
		);
	});

	it('round-trips through parseChampionFilter', () => {
		const filters = [
			{ role: 'jungle', patch: null, rank: null },
			{ role: null, patch: 'all', rank: { tier: 'gold', andAbove: true } },
			{ role: 'top', patch: '16.19', rank: { tier: 'master', andAbove: false } }
		] as const;
		for (const filter of filters) {
			expect(parseChampionFilter(params(championQuery(filter).slice(1)))).toEqual(filter);
		}
	});
});

describe('proxyQuery', () => {
	it("asks for every champion, without a tier, in riot-proxy's role names", () => {
		expect(proxyQuery({ role: 'mid', patch: 'all', rank: null })).toEqual({
			queue: 'RANKED_SOLO_5x5',
			patch: 'all',
			role: 'MIDDLE',
			minGames: 0,
			limit: 500
		});
	});

	it('sends one tier as tier, a tier and above as minTier, never both', () => {
		const diamond = {
			role: null,
			patch: 'all',
			rank: { tier: 'diamond', andAbove: false }
		} as const;
		expect(proxyQuery(diamond)).toEqual({
			queue: 'RANKED_SOLO_5x5',
			patch: 'all',
			tier: 'DIAMOND',
			minGames: 0,
			limit: 500
		});
		const above = proxyQuery({ ...diamond, rank: { tier: 'diamond', andAbove: true } });
		expect(above).toMatchObject({ minTier: 'DIAMOND' });
		expect(above).not.toHaveProperty('tier');
		// Keys in the order the mock proxy's recorded paths use.
		expect(Object.keys(analyticsQuery({ ...diamond, role: 'mid' }))).toEqual([
			'queue',
			'patch',
			'role',
			'tier',
			'minGames'
		]);
	});

	it("leaves the patch out for riot-proxy's newest, and the role out for every role", () => {
		expect(proxyQuery({ role: null, patch: null, rank: null })).toEqual({
			queue: 'RANKED_SOLO_5x5',
			minGames: 0,
			limit: 500
		});
	});
});

describe('toChampionTable', () => {
	const table = toChampionTable(recorded, names);

	it('keeps one row per champion, with its rates as riot-proxy sent them', () => {
		expect(table.patch).toBe('all');
		expect(table.rows).toHaveLength(recorded.champions.length);
		expect(new Set(table.rows.map((r) => r.id)).size).toBe(table.rows.length);
		const first = recorded.champions[0];
		expect(table.rows[0]).toMatchObject({
			id: first.championId,
			games: first.games,
			winRate: first.winRate,
			pickRate: first.pickRate,
			banRate: first.banRate
		});
	});

	it('names champions from Data Dragon, else from riot-proxy', () => {
		const ahri = table.rows.find((r) => r.id === 103);
		expect(ahri).toMatchObject({ key: 'Ahri', name: 'Ahri' });
		const unknown = table.rows.find((r) => !names.champions[r.id]);
		const row = recorded.champions.find((c) => c.championId === unknown?.id);
		expect(unknown).toMatchObject({ key: null, name: row?.championName });
	});

	it("keeps the rows of the body's own tier when one was asked for", () => {
		const master = {
			...recorded,
			tier: 'MASTER',
			champions: [{ ...recorded.champions[0], tier: 'MASTER' }, recorded.champions[1]]
		};
		expect(toChampionTable(master, names).rows.map((r) => r.id)).toEqual([
			recorded.champions[0].championId
		]);
	});

	it('keeps the summed rows under a range: their tier is null', () => {
		const range = { ...recorded, minTier: 'DIAMOND' };
		expect(toChampionTable(range, names).rows).toHaveLength(recorded.champions.length);
	});

	it('leaves out per-tier rows', () => {
		const tiered = {
			...recorded,
			champions: [{ ...recorded.champions[0], tier: 'MASTER' }, recorded.champions[1]]
		};
		expect(toChampionTable(tiered, names).rows.map((r) => r.id)).toEqual([
			recorded.champions[1].championId
		]);
	});
});

describe('patchOptions', () => {
	it('lists the patches newest first', () => {
		const patches = fixtureBody('/v1/lol/analytics/patches?queue=RANKED_SOLO_5x5') as Patches;
		expect(patchOptions(patches)[0]).toBe('16.20');
		expect(patchOptions(patches)).toEqual(patches.patches.map((p) => p.patch));
		expect(patchOptions(undefined)).toEqual([]);
	});
});

describe('sortRows', () => {
	const row = (id: number, rates: Partial<ChampionRow>): ChampionRow => ({
		id,
		key: null,
		name: `C${id}`,
		games: 100,
		winRate: 0.5,
		pickRate: 0.1,
		banRate: 0.1,
		...rates
	});
	const rows = [
		row(1, { winRate: 0.48, pickRate: 0.2, banRate: null }),
		row(2, { winRate: 0.55, pickRate: 0.05, banRate: 0.3 }),
		row(3, { winRate: 0.52, pickRate: 0.1, banRate: 0.01 })
	];
	const ids = (sorted: ChampionRow[]) => sorted.map((r) => r.id);

	it('sorts highest first by the chosen rate, a missing rate last', () => {
		expect(ids(sortRows(rows, 'win'))).toEqual([2, 3, 1]);
		expect(ids(sortRows(rows, 'pick'))).toEqual([1, 3, 2]);
		expect(ids(sortRows(rows, 'ban'))).toEqual([2, 3, 1]);
	});

	it('breaks ties by games, then name', () => {
		const tied = [row(1, { games: 50 }), row(3, {}), row(2, {})];
		expect(ids(sortRows(tied, 'win'))).toEqual([2, 3, 1]);
	});

	it('does not change the rows it was given', () => {
		sortRows(rows, 'win');
		expect(ids(rows)).toEqual([1, 2, 3]);
	});
});

describe('parseSort and formatRate', () => {
	it('reads the sort, defaulting to pick rate', () => {
		expect(parseSort('win')).toBe('win');
		expect(parseSort('games')).toBe('pick');
		expect(parseSort(null)).toBe('pick');
	});

	it('formats a rate as a percentage', () => {
		expect(formatRate(0.51234)).toBe('51.2%');
		expect(formatRate(null)).toBe('–');
	});
});

describe('analyticsQuery', () => {
	it('adds a limit only when given', () => {
		expect(analyticsQuery({ role: 'top', patch: '16.19', rank: null })).toEqual({
			queue: 'RANKED_SOLO_5x5',
			patch: '16.19',
			role: 'TOP',
			minGames: 0
		});
		expect(analyticsQuery({ role: null, patch: 'all', rank: null }, 10)).toEqual({
			queue: 'RANKED_SOLO_5x5',
			patch: 'all',
			minGames: 0,
			limit: 10
		});
	});
});

describe('patchLabel and pickerPatches', () => {
	it('names the patch shown', () => {
		expect(patchLabel('all')).toBe('All patches');
		expect(patchLabel('16.19')).toBe('Patch 16.19');
		expect(patchLabel(null)).toBe('Newest patch');
	});

	it("offers the patch shown even when riot-proxy's list lacks it", () => {
		expect(pickerPatches('16.10', ['16.20', '16.19'])).toEqual(['16.10', '16.20', '16.19']);
		expect(pickerPatches('16.19', ['16.20', '16.19'])).toEqual(['16.20', '16.19']);
		expect(pickerPatches('all', [])).toEqual([]);
	});
});

describe('sample size', () => {
	it('hides nothing and marks rates under 100 games', () => {
		expect(MIN_GAMES).toBe(0);
		expect(LOW_SAMPLE_GAMES).toBe(100);
		expect(isLowSample(99)).toBe(true);
		expect(isLowSample(100)).toBe(false);
		expect(isLowSample(0)).toBe(true);
	});
});
