import { describe, expect, it } from 'vitest';
import type { components } from '#lib/api/schema.d.ts';
import {
	openBuild,
	roleLabel,
	toChampionStats,
	toMatchups,
	toPopularChoices,
	parseVsPick,
	toSetBuilds,
	toTierRows,
	vsChoices,
	withPick,
	type VsPick
} from '#lib/domain/champion-page.ts';
import { fixtureBody, recordedNames } from './fixtures.ts';

type Schemas = components['schemas'];
const names = recordedNames();
const BASE = '/v1/lol/analytics/champions/103';
const detail = fixtureBody(
	`${BASE}?queue=RANKED_SOLO_5x5&patch=all&minGames=0&limit=10`
) as Schemas['ChampionDetailResponse'];
const builds = fixtureBody(
	`${BASE}/builds?queue=RANKED_SOLO_5x5&patch=all&minGames=0`
) as Schemas['ChampionBuildsResponse'];
const matchups = (
	fixtureBody(
		`${BASE}/matchups?queue=RANKED_SOLO_5x5&patch=all&minGames=0&limit=200`
	) as Schemas['ChampionMatchupsResponse']
).matchups;

describe('toChampionStats', () => {
	it("takes riot-proxy's summed row as sent", () => {
		expect(toChampionStats(detail.stats)).toEqual({
			games: 2407,
			winRate: 0.5048,
			pickRate: 0.1138,
			banRate: 0.0447
		});
	});

	it('takes the row of the tier asked for, as riot-proxy labels it', () => {
		const master = { ...detail.stats[0], tier: 'MASTER', games: 722 };
		expect(toChampionStats([master], 'MASTER')?.games).toBe(722);
		expect(toChampionStats([master])).toBeNull();
	});

	it('is null with no summed row', () => {
		expect(toChampionStats([])).toBeNull();
		expect(toChampionStats([{ ...detail.stats[0], tier: 'MASTER' }])).toBeNull();
	});
});

describe('toTierRows', () => {
	it('orders tiers from the top, Unplaced last', () => {
		expect(toTierRows(detail.byTier).map((t) => [t.label, t.games])).toEqual([
			['Challenger', 38],
			['Grandmaster', 43],
			['Master', 722],
			['Emerald', 13],
			['Platinum', 1],
			['Unplaced', 1590]
		]);
	});

	it('puts a tier it does not know before Unplaced', () => {
		const row = detail.byTier[0];
		const rows = toTierRows([
			{ ...row, tier: 'UNKNOWN' },
			{ ...row, tier: 'MYTHIC' },
			{ ...row, tier: 'IRON' }
		]);
		expect(rows.map((t) => t.tier)).toEqual(['IRON', 'MYTHIC', 'UNKNOWN']);
	});
});

describe('toSetBuilds', () => {
	const set = toSetBuilds(builds, names);

	it("keeps riot-proxy's role, games and builds in order", () => {
		expect(set.role).toBe('MIDDLE');
		expect(set.totalGames).toBe(1994);
		expect(set.builds.map((b) => b.core.map((i) => i.id))).toEqual([
			[3118, 4645],
			[3118, 3100],
			[2503, 3100]
		]);
	});

	it("names the top option of each part, and every later item's options", () => {
		const first = set.builds[0];
		expect(first).toMatchObject({ games: 550, winRate: 0.4927, pickRate: 0.2758 });
		expect(first.core.map((i) => i.name)).toEqual(['Malignance', 'Shadowflame']);
		expect(first.starter).toEqual([
			{ id: 1056, name: "Doran's Ring", count: 1 },
			{ id: 2003, name: 'Health Potion', count: 2 }
		]);
		expect(first.boots).toEqual({ id: 3020, name: "Sorcerer's Shoes" });
		expect(first.skillOrder).toBe('QWE');
		expect(first.runes?.keystone).toMatchObject({ id: 8112, name: 'Electrocute' });
		expect(first.runes?.subStyle).toMatchObject({ id: 8200, name: 'Sorcery' });
		expect(first.spells?.map((s) => s?.name)).toEqual(['Flash', 'Teleport']);
		expect(first.next).toHaveLength(3);
		expect(first.next[0][0]).toMatchObject({ id: 3089, games: 142, winRate: 0.5211 });
	});

	it("reads a v2.7.0 body: no range, no opponent, each build's winRateLow", () => {
		expect(builds).toMatchObject({ tier: null, minTier: null, side: null, opponentId: null });
		expect(builds.builds.map((b) => b.winRateLow)).toEqual([0.4511, 0.4917, 0.5116]);
		expect(set.builds).toHaveLength(3);
		expect(set.builds[0]).toMatchObject({ games: 550, winRate: 0.4927 });
	});

	it('leaves a part out when nobody chose one', () => {
		const empty = toSetBuilds(
			{
				...builds,
				builds: [
					{ ...builds.builds[0], starter: [], boots: [], skillOrder: [], runes: [], spells: [] }
				]
			},
			names
		).builds[0];
		expect(empty).toMatchObject({
			starter: null,
			boots: null,
			skillOrder: null,
			runes: null,
			spells: null
		});
	});

	it("falls back to an item's id when Data Dragon lacks it", () => {
		const set = toSetBuilds(
			{ ...builds, builds: [{ ...builds.builds[0], core: [999999, 3118] }] },
			names
		);
		expect(set.builds[0].core[0]).toEqual({ id: 999999, name: 'Item 999999' });
	});
});

describe('toPopularChoices', () => {
	it("names the detail's items, runes and spells as sent", () => {
		const popular = toPopularChoices(detail, names);
		expect(popular.items).toHaveLength(detail.items.length);
		expect(popular.items[0]).toEqual({
			id: 3118,
			name: 'Malignance',
			games: detail.items[0].games,
			winRate: detail.items[0].winRate
		});
		expect(popular.runes[0].keystone?.name).toBe('Electrocute');
		expect(popular.spells[0].spells.map((s) => s?.key)).toEqual([4, 12]);
	});
});

describe('toMatchups', () => {
	it('keeps one lane, most games first', () => {
		const mid = toMatchups(matchups, 'MIDDLE', names);
		expect(mid).toHaveLength(116);
		expect(mid.every((m) => m.role === 'MIDDLE')).toBe(true);
		expect(mid[0]).toMatchObject({ name: 'Sylas', key: 'Sylas', games: 126, winRate: 0.4762 });
		expect(mid.map((m) => m.games)).toEqual(mid.map((m) => m.games).toSorted((a, b) => b - a));
	});

	it("keeps every lane without one, and names opponents from riot-proxy when Data Dragon can't", () => {
		const all = toMatchups(matchups, null, names);
		expect(all).toHaveLength(matchups.length);
		const unknown = all.find((m) => m.key === null);
		expect(unknown).toBeDefined();
		expect(unknown?.name).toBe(
			matchups.find((m) => m.opponentId === unknown?.opponentId)?.opponentName
		);
	});
});

describe('openBuild and roleLabel', () => {
	it('reads the open build, 1-based, defaulting to the first', () => {
		expect(openBuild('2', 3)).toBe(1);
		expect(openBuild('4', 3)).toBe(0);
		expect(openBuild('x', 3)).toBe(0);
		expect(openBuild(null, 0)).toBe(0);
	});

	it("names riot-proxy's roles as the tabs do", () => {
		expect(roleLabel('MIDDLE')).toBe('Mid');
		expect(roleLabel('UTILITY')).toBe('Support');
		expect(roleLabel('NONE')).toBe('None');
	});
});

describe('toSetBuilds against a lane opponent', () => {
	const against = toSetBuilds(
		fixtureBody(
			`${BASE}/builds?queue=RANKED_SOLO_5x5&patch=all&opponentId=134&minGames=0`
		) as Schemas['ChampionBuildsResponse'],
		names
	);

	it("keeps riot-proxy's lane and games against the opponent", () => {
		expect(against).toMatchObject({ role: 'MIDDLE', totalGames: 71 });
	});

	it('keeps the 3rd item and leaves out the empty 4th and 5th, starter and skills', () => {
		const first = against.builds[0];
		expect(first.next).toHaveLength(1);
		expect(first.next[0].length).toBeGreaterThan(0);
		expect(first.starter).toBeNull();
		expect(first.skillOrder).toBeNull();
		expect(first.boots).not.toBeNull();
		expect(first.runes?.keystone).not.toBeNull();
		expect(first.spells).not.toBeNull();
	});

	it('keeps empty steps without an opponent, where they mean nobody chose one', () => {
		const empty = toSetBuilds(
			{ ...builds, builds: [{ ...builds.builds[0], next: [[], [], []] }] },
			names
		);
		expect(empty.builds[0].next).toEqual([[], [], []]);
	});
});

describe('parseVsPick and withPick', () => {
	const params = (query: string) => new URLSearchParams(query);
	const syndra = { opponentId: 134, slug: 'syndra', name: 'Syndra' };

	it("reads an opponent by its champion page's name, and a lane", () => {
		expect(parseVsPick(params('vs=syndra&lane=mid'), names.champions, null)).toEqual({
			...syndra,
			lane: 'mid'
		});
		expect(parseVsPick(params('vs=kaisa'), names.champions, null)).toMatchObject({
			opponentId: 145,
			name: "Kai'Sa",
			lane: null
		});
	});

	it('reads the opponent without regard to case, as the champion route does', () => {
		expect(parseVsPick(params('vs=Syndra'), names.champions, null)).toEqual({
			...syndra,
			lane: null
		});
	});

	it('drops an unknown opponent, and only the lane when it is unknown', () => {
		expect(parseVsPick(params(''), names.champions, null)).toBeNull();
		expect(parseVsPick(params('vs=134'), names.champions, null)).toBeNull();
		expect(parseVsPick(params('vs=nobody&lane=mid'), names.champions, null)).toBeNull();
		expect(parseVsPick(params('vs=syndra&lane=MIDDLE'), names.champions, null)).toEqual({
			...syndra,
			lane: null
		});
	});

	it('drops the lane when a role is picked: the role is the lane', () => {
		expect(parseVsPick(params('vs=syndra&lane=top'), names.champions, 'mid')).toEqual({
			...syndra,
			lane: null
		});
	});

	it('adds the pick to a query, after the filter', () => {
		expect(withPick('', null)).toBe('');
		expect(withPick('', { slug: 'syndra', lane: null })).toBe('?vs=syndra');
		expect(withPick('?rank=gold+', { slug: 'syndra', lane: 'mid' })).toBe(
			'?rank=gold+&vs=syndra&lane=mid'
		);
	});
});

describe('vsChoices', () => {
	const entry = (opponentId: number, role: string, games: number) => ({
		opponentId,
		opponentName: null,
		role,
		games,
		wins: 0,
		winRate: 0
	});

	it('lists each opponent once, games summed over lanes, most first', () => {
		const choices = vsChoices(matchups, null, names);
		const sylas = choices.find((c) => c.name === 'Sylas');
		// Sylas: 126 in Mid, 2 as Support, 1 in Top.
		expect(sylas).toEqual({ opponentId: 517, slug: 'sylas', name: 'Sylas', games: 129 });
		expect(choices.filter((c) => c.opponentId === 517)).toHaveLength(1);
		expect(choices[0].name).toBe('Sylas');
		const games = choices.map((c) => c.games ?? 0);
		expect(games).toEqual(games.toSorted((a, b) => b - a));
	});

	it('breaks ties by name', () => {
		const tied = [
			entry(134, 'MIDDLE', 5),
			entry(103, 'MIDDLE', 5),
			entry(81, 'MIDDLE', 3),
			entry(81, 'BOTTOM', 2)
		];
		expect(vsChoices(tied, null, names).map((c) => c.name)).toEqual(['Ahri', 'Ezreal', 'Syndra']);
	});

	it('puts a picked opponent the list lacks last, without a count', () => {
		const yuumi: VsPick = { opponentId: 350, slug: 'yuumi', name: 'Yuumi', lane: null };
		const choices = vsChoices([entry(134, 'MIDDLE', 5)], yuumi, names);
		expect(choices.at(-1)).toEqual({ opponentId: 350, slug: 'yuumi', name: 'Yuumi', games: null });
		const listed = vsChoices([entry(350, 'UTILITY', 2)], yuumi, names);
		expect(listed).toEqual([{ opponentId: 350, slug: 'yuumi', name: 'Yuumi', games: 2 }]);
	});

	it("leaves out an opponent Data Dragon doesn't know: it has no URL", () => {
		expect(vsChoices([{ ...entry(9999, 'MIDDLE', 50), opponentName: 'New' }], null, names)).toEqual(
			[]
		);
	});
});
