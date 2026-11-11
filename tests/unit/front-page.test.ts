import { describe, expect, it } from 'vitest';
import { toChampionTable } from '#lib/domain/champion-stats.ts';
import {
	DEFAULT_REGION,
	EXAMPLE_SEARCHES,
	FRONT_REGIONS,
	TOP_WIN_RATE_MIN_GAMES,
	allRunning,
	fetchedAge,
	formatCount,
	frontQuery,
	gamesAnalysed,
	parseRotation,
	parseStatus,
	pickRegion,
	rotationChampions,
	topWinRates,
	winRateBar,
	type PlatformStatus
} from '#lib/domain/front-page.ts';
import { REGIONS, findRegion } from '#lib/domain/regions.ts';
import type { components } from '#lib/api/schema.d.ts';
import { fixtureBody, recordedNames } from './fixtures.ts';

type ChampionStatsResponse = components['schemas']['ChampionStatsResponse'];

const ANALYTICS_PATH =
	'/v1/lol/analytics/champions?queue=RANKED_SOLO_5x5&patch=all&minGames=0&limit=500';

function recordedTable() {
	// The recorded body, as the typed client hands it over.
	const body = fixtureBody(ANALYTICS_PATH) as ChampionStatsResponse;
	return toChampionTable(body, recordedNames());
}

describe('topWinRates', () => {
	it('lists the six highest win rates over 800 games, highest first', () => {
		const rows = topWinRates(recordedTable());
		expect(rows.map((r) => r.name)).toEqual([
			'Taliyah',
			'Gragas',
			'Riven',
			'Janna',
			"Vel'Koz",
			'Nocturne'
		]);
		expect(rows.every((r) => r.games >= TOP_WIN_RATE_MIN_GAMES)).toBe(true);
		const rates = rows.map((r) => r.winRate);
		expect(rates).toEqual(rates.toSorted((a, b) => b - a));
	});

	it('leaves out every champion under the floor', () => {
		expect(topWinRates(recordedTable(), 10_000_000)).toEqual([]);
	});

	it('lists as many as asked', () => {
		expect(topWinRates(recordedTable(), 800, 2).map((r) => r.name)).toEqual(['Taliyah', 'Gragas']);
	});
});

describe('winRateBar', () => {
	it('runs from 0 at 45 % to 100 at 60 %, in whole percent', () => {
		expect(winRateBar(0.45)).toBe(0);
		expect(winRateBar(0.525)).toBe(50);
		expect(winRateBar(0.6)).toBe(100);
	});

	it('stays within the bar', () => {
		expect(winRateBar(0.3)).toBe(0);
		expect(winRateBar(0.9)).toBe(100);
	});
});

describe('gamesAnalysed', () => {
	it("counts each game once: a tenth of riot-proxy's participant games", () => {
		expect(gamesAnalysed(23_382_890)).toBe(2_338_289);
		expect(gamesAnalysed(211590)).toBe(21159);
		expect(gamesAnalysed(0)).toBe(0);
	});

	it('rounds down a count that is not a whole number of games', () => {
		expect(gamesAnalysed(19)).toBe(1);
		expect(gamesAnalysed(9)).toBe(0);
	});

	it("divides what the recording shows: `totalGames` is the sum of every champion's games", () => {
		const { totalGames, champions } = fixtureBody(ANALYTICS_PATH) as ChampionStatsResponse;
		expect(champions.reduce((sum, c) => sum + c.games, 0)).toBe(totalGames);
		expect(totalGames % 10).toBe(0);
	});
});

describe('formatCount', () => {
	it('groups thousands with commas', () => {
		expect(formatCount(211590)).toBe('211,590');
		expect(formatCount(12)).toBe('12');
	});
});

describe('EXAMPLE_SEARCHES', () => {
	it('links two champion pages and a profile', () => {
		expect(EXAMPLE_SEARCHES.map((e) => e.href)).toEqual([
			'/champions/ahri',
			'/champions/jinx',
			'/summoner/NinjaGoldfinch-OCENZ'
		]);
	});
});

describe('pickRegion and frontQuery', () => {
	const korea = findRegion('kr');

	it('reads the region from the query, without regard to case, else Oceania', () => {
		expect(pickRegion(new URLSearchParams(''))).toBe(DEFAULT_REGION);
		expect(DEFAULT_REGION.slug).toBe('oce');
		expect(DEFAULT_REGION.platform).toBe('oc1');
		expect(pickRegion(new URLSearchParams('region=KR'))).toBe(korea);
		expect(pickRegion(new URLSearchParams('region=mars'))).toBe(DEFAULT_REGION);
	});

	it('leaves out the Middle East, which riot-proxy 2.10.0 does not serve, until it does', () => {
		const middleEast = findRegion('me');
		expect(middleEast?.platform).toBe('me1');
		expect(FRONT_REGIONS).not.toContain(middleEast);
		expect(pickRegion(new URLSearchParams('region=me'))).toBe(DEFAULT_REGION);
		expect(pickRegion(new URLSearchParams('region=ME'))).toBe(DEFAULT_REGION);
		// Every other region is still offered, in REGIONS' order.
		expect(FRONT_REGIONS).toEqual(REGIONS.filter((r) => r.slug !== 'me'));
	});

	it('leaves the default out of the canonical query', () => {
		expect(frontQuery(DEFAULT_REGION)).toBe('');
		expect(korea && frontQuery(korea)).toBe('?region=kr');
	});
});

describe('parseRotation', () => {
	it("reads Riot's ChampionInfo", () => {
		const rotation = parseRotation(fixtureBody('/v1/lol/rotations/oc1'));
		expect(rotation?.free).toHaveLength(17);
		expect(rotation?.forNewPlayers).toEqual([81, 53, 111, 350, 432]);
		expect(rotation?.maxNewPlayerLevel).toBe(10);
	});

	it('keeps integer ids only, and needs nothing but freeChampionIds', () => {
		expect(parseRotation({ freeChampionIds: [1, 'x', 2.5, 3] })).toEqual({
			free: [1, 3],
			forNewPlayers: [],
			maxNewPlayerLevel: null
		});
	});

	it('reads nothing else', () => {
		for (const body of [{}, null, [], 'free', { freeChampionIds: 'all' }]) {
			expect(parseRotation(body)).toBeUndefined();
		}
	});
});

describe('rotationChampions', () => {
	it('names the free champions by name, leaving out ids the lookups lack', () => {
		const rotation = parseRotation(fixtureBody('/v1/lol/rotations/oc1'));
		if (!rotation) throw new Error('unreadable rotation fixture');
		const champions = rotationChampions(rotation, recordedNames().champions);

		expect(champions).toHaveLength(16);
		expect(champions.map((c) => c.id)).not.toContain(999);
		expect(champions[0]).toEqual({ id: 103, key: 'Ahri', name: 'Ahri' });
		const names = champions.map((c) => c.name);
		expect(names).toEqual(names.toSorted((a, b) => a.localeCompare(b)));
	});
});

describe('parseStatus', () => {
	it('reads incidents and open maintenances, with English titles', () => {
		const status = parseStatus(fixtureBody('/v1/lol/status/kr'));
		expect(status?.name).toBe('Korea');
		expect(status?.incidents).toEqual([
			{
				id: 9101,
				key: 'id-9101',
				title: 'Ranked queues are disabled',
				severity: 'warning',
				maintenanceStatus: null,
				updatedAt: '2026-11-09T01:10:00Z',
				missing: []
			},
			// The incident without a title is kept, under a generic one.
			{
				id: 9103,
				key: 'id-9103',
				title: 'Incident',
				severity: 'info',
				maintenanceStatus: null,
				updatedAt: null,
				missing: ['title']
			}
		]);
		// The completed maintenance is dropped.
		expect(status?.maintenances.map((m) => [m.title, m.maintenanceStatus])).toEqual([
			['Scheduled maintenance for patch 16.21', 'scheduled']
		]);
	});

	it('takes the first title without an English one, and drops unknown severities', () => {
		const status = parseStatus({
			maintenances: [],
			incidents: [
				{
					id: 1,
					incident_severity: 'catastrophic',
					titles: [{ locale: 'ko_KR', content: '점검' }, { locale: 'ja_JP' }]
				}
			]
		});
		expect(status?.incidents).toEqual([
			{
				id: 1,
				key: 'id-1',
				title: '점검',
				severity: null,
				maintenanceStatus: null,
				updatedAt: null,
				missing: []
			}
		]);
	});

	it('keeps an incident without a title, under a generic one, so the card is not all clear', () => {
		const status = parseStatus({
			maintenances: [],
			incidents: [{ id: 1, incident_severity: 'critical', titles: [] }]
		});
		if (!status) throw new Error('unreadable status');
		expect(status.incidents).toEqual([
			{
				id: 1,
				key: 'id-1',
				title: 'Incident',
				severity: 'critical',
				maintenanceStatus: null,
				updatedAt: null,
				missing: ['title']
			}
		]);
		expect(allRunning(status)).toBe(false);
	});

	it('keeps entries without a usable id, keyed by their place in the feed', () => {
		const status = parseStatus({
			incidents: [
				{ id: 'two', titles: [{ locale: 'en_US', content: 'No id' }] },
				{ id: 3, titles: [{ locale: 'en_US', content: 'Has an id' }] },
				{ id: 2.5, titles: 'none' }
			],
			maintenances: [
				{ maintenance_status: 'in_progress', titles: [] },
				{ maintenance_status: 'complete', titles: [] },
				null
			]
		});
		if (!status) throw new Error('unreadable status');
		expect(status.incidents.map((i) => [i.id, i.key, i.title, i.missing])).toEqual([
			[null, 'at-0', 'No id', ['id']],
			[3, 'id-3', 'Has an id', []],
			[null, 'at-2', 'Incident', ['id', 'title']]
		]);
		// A completed maintenance is still dropped, with or without an id; an
		// entry that is not even an object is kept as an unknown maintenance.
		expect(
			status.maintenances.map((m) => [m.key, m.title, m.maintenanceStatus, m.missing])
		).toEqual([
			['at-0', 'Maintenance', 'in_progress', ['id', 'title']],
			['at-2', 'Maintenance', null, ['id', 'title']]
		]);
		expect(allRunning(status)).toBe(false);
		const keys = [...status.incidents, ...status.maintenances].map((i) => i.key);
		expect(new Set(keys.slice(0, 3)).size).toBe(3);
	});

	it('reads nothing without both lists', () => {
		for (const body of [{ incidents: [] }, { maintenances: [] }, null, [], 'up']) {
			expect(parseStatus(body)).toBeUndefined();
		}
	});
});

describe('allRunning', () => {
	it('is true with nothing open', () => {
		const ok = parseStatus(fixtureBody('/v1/lol/status/oc1'));
		const kr = parseStatus(fixtureBody('/v1/lol/status/kr'));
		const read = (s: PlatformStatus | undefined) => {
			if (!s) throw new Error('unreadable status fixture');
			return allRunning(s);
		};
		expect(read(ok)).toBe(true);
		expect(read(kr)).toBe(false);
	});
});

describe('fetchedAge', () => {
	it('reads whole non-negative seconds only', () => {
		expect(fetchedAge('180')).toBe(180);
		expect(fetchedAge('0')).toBe(0);
		for (const header of ['', '-1', 'abc', '1.5', null]) expect(fetchedAge(header)).toBeNull();
	});
});
