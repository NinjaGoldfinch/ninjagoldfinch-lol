import { describe, expect, it } from 'vitest';
import type { components } from '#lib/api/schema.d.ts';
import {
	DEFAULT_PATCH,
	championQuery,
	formatRate,
	parseChampionFilter,
	parseSort,
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
const ALL = '/v1/lol/analytics/champions?queue=RANKED_SOLO_5x5&patch=all&limit=500';
const recorded = fixtureBody(ALL) as Stats;

const params = (query: string) => new URLSearchParams(query);

describe('parseChampionFilter', () => {
	it('defaults to every role on all patches', () => {
		expect(DEFAULT_PATCH).toBe('all');
		expect(parseChampionFilter(params(''))).toEqual({ role: null, patch: 'all' });
	});

	it('reads a role and a patch', () => {
		expect(parseChampionFilter(params('role=mid&patch=16.19'))).toEqual({
			role: 'mid',
			patch: '16.19'
		});
		expect(parseChampionFilter(params('patch=newest')).patch).toBeNull();
	});

	it('ignores what is not offered', () => {
		expect(parseChampionFilter(params('role=MIDDLE&patch=16.19.1'))).toEqual({
			role: null,
			patch: 'all'
		});
		expect(parseChampionFilter(params('patch=x')).patch).toBe('all');
	});
});

describe('championQuery', () => {
	it('leaves out defaults', () => {
		expect(championQuery({ role: null, patch: 'all' })).toBe('');
		expect(championQuery({ role: null, patch: 'all' }, 'pick')).toBe('');
	});

	it('names the role, a patch other than the default, and the sort', () => {
		expect(championQuery({ role: 'support', patch: '16.19' }, 'ban')).toBe(
			'?role=support&patch=16.19&sort=ban'
		);
		expect(championQuery({ role: null, patch: null })).toBe('?patch=newest');
	});

	it('round-trips through parseChampionFilter', () => {
		const filter = { role: 'jungle', patch: null } as const;
		expect(parseChampionFilter(params(championQuery(filter).slice(1)))).toEqual(filter);
	});
});

describe('proxyQuery', () => {
	it("asks for every champion, without a tier, in riot-proxy's role names", () => {
		expect(proxyQuery({ role: 'mid', patch: 'all' })).toEqual({
			queue: 'RANKED_SOLO_5x5',
			patch: 'all',
			role: 'MIDDLE',
			limit: 500
		});
	});

	it("leaves the patch out for riot-proxy's newest, and the role out for every role", () => {
		expect(proxyQuery({ role: null, patch: null })).toEqual({
			queue: 'RANKED_SOLO_5x5',
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
		expect(analyticsQuery({ role: 'top', patch: '16.19' })).toEqual({
			queue: 'RANKED_SOLO_5x5',
			patch: '16.19',
			role: 'TOP'
		});
		expect(analyticsQuery({ role: null, patch: 'all' }, 10)).toEqual({
			queue: 'RANKED_SOLO_5x5',
			patch: 'all',
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
