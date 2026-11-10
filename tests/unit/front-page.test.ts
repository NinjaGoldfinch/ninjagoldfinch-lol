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
	parseStatus,
	pickRegion,
	riotStatusUrl,
	statusHeadline,
	statusView,
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

/** Two hours after the Korean fixture's warning incident was last updated. */
const NOW = Date.parse('2026-11-09T03:10:00Z');

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
				createdAt: '2026-11-09T01:00:00Z',
				updatedAt: '2026-11-09T01:10:00Z',
				update: 'Ranked queues are disabled while we investigate an issue.',
				missing: []
			},
			// The incident without a title is kept, under a generic one.
			{
				id: 9103,
				key: 'id-9103',
				title: 'Incident',
				severity: 'info',
				maintenanceStatus: null,
				createdAt: '2026-11-09T00:00:00Z',
				updatedAt: null,
				update: null,
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
				createdAt: null,
				updatedAt: null,
				update: null,
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
				createdAt: null,
				updatedAt: null,
				update: null,
				missing: ['title']
			}
		]);
		expect(allRunning(statusView(status, NOW))).toBe(false);
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
		expect(allRunning(statusView(status, NOW))).toBe(false);
		const keys = [...status.incidents, ...status.maintenances].map((i) => i.key);
		expect(new Set(keys.slice(0, 3)).size).toBe(3);
	});

	it('reads nothing without both lists', () => {
		for (const body of [{ incidents: [] }, { maintenances: [] }, null, [], 'up']) {
			expect(parseStatus(body)).toBeUndefined();
		}
	});
});

describe('the newest update of a status entry', () => {
	const update = (updates: unknown) =>
		parseStatus({ maintenances: [], incidents: [{ id: 1, updates }] })?.incidents[0]?.update;
	const text = (content: string, locale = 'en_US') => [{ locale, content }];

	it('is the one updated last, whatever its place in the list', () => {
		expect(
			update([
				{ translations: text('first'), updated_at: '2026-11-09T01:00:00Z' },
				{ translations: text('newest'), updated_at: '2026-11-09T03:00:00Z' },
				{ translations: text('second'), updated_at: '2026-11-09T02:00:00Z' }
			])
		).toBe('newest');
	});

	it('goes by `created_at` without `updated_at`, and counts one without a time as the oldest', () => {
		expect(
			update([
				{ translations: text('no time') },
				{ translations: text('created'), created_at: '2026-11-09T01:00:00Z', updated_at: null },
				{ translations: text('not a time'), updated_at: 'soon' }
			])
		).toBe('created');
		// With no times at all, the first in the list.
		expect(update([{ translations: text('a') }, { translations: text('b') }])).toBe('a');
	});

	it('is in English when the update has it, else its first translation', () => {
		expect(
			update([{ translations: [...text('점검 중', 'ko_KR'), ...text('Under maintenance')] }])
		).toBe('Under maintenance');
		expect(update([{ translations: text('점검 중', 'ko_KR') }])).toBe('점검 중');
	});

	it('passes over unpublished updates and those without text', () => {
		expect(
			update([
				{ translations: text('draft'), publish: false, updated_at: '2026-11-09T05:00:00Z' },
				{ translations: text('   '), updated_at: '2026-11-09T04:00:00Z' },
				{ translations: [], updated_at: '2026-11-09T03:00:00Z' },
				'nope',
				{ translations: text(' published \n'), publish: true, updated_at: '2026-11-09T01:00:00Z' }
			])
		).toBe('published');
	});

	it('is null without updates, or with none readable', () => {
		for (const updates of [undefined, null, 'none', [], [{ translations: 'none' }]]) {
			expect(update(updates)).toBeNull();
		}
	});
});

function view(body: unknown, now = NOW) {
	const status: PlatformStatus | undefined = parseStatus(body);
	if (!status) throw new Error('unreadable status');
	return statusView(status, now);
}

describe('statusView', () => {
	it("shapes Korea's fixture: counts, each entry's state, newest update and age", () => {
		expect(view(fixtureBody('/v1/lol/status/kr'))).toEqual({
			incidents: 2,
			maintenances: 1,
			entries: [
				{
					key: 'Incident-id-9101',
					kind: 'Incident',
					title: 'Ranked queues are disabled',
					state: 'warning',
					tone: 'warning',
					update: 'Ranked queues are disabled while we investigate an issue.',
					age: { event: 'updated', seconds: 7200 }
				},
				// Never updated: its age is counted from when it was opened.
				{
					key: 'Incident-id-9103',
					kind: 'Incident',
					title: 'Incident',
					state: 'info',
					tone: 'info',
					update: null,
					age: { event: 'opened', seconds: 11400 }
				},
				{
					key: 'Maintenance-id-9201',
					kind: 'Maintenance',
					title: 'Scheduled maintenance for patch 16.21',
					state: 'scheduled',
					tone: 'maintenance',
					update: null,
					age: { event: 'updated', seconds: 18600 }
				}
			]
		});
	});

	it('lists the worst first: critical, warnings and maintenance under way, notices, then other maintenance', () => {
		const titled = (content: string) => [{ locale: 'en_US', content }];
		const status = view({
			incidents: [
				{ id: 1, incident_severity: 'info', titles: titled('notice') },
				{ id: 2, incident_severity: 'warning', titles: titled('warning') },
				{ id: 3, incident_severity: 'critical', titles: titled('critical') },
				// A severity the site does not know is open all the same: a warning (ADR-072).
				{ id: 4, incident_severity: 'catastrophic', titles: titled('unknown') }
			],
			maintenances: [
				{ id: 5, maintenance_status: 'scheduled', titles: titled('scheduled') },
				{ id: 6, maintenance_status: 'in_progress', titles: titled('under way') },
				{ id: 7, titles: titled('stateless') }
			]
		});
		expect(status.entries.map((e) => [e.title, e.tone, e.state])).toEqual([
			['critical', 'critical', 'critical'],
			['warning', 'warning', 'warning'],
			['unknown', 'warning', null],
			['under way', 'warning', 'in progress'],
			['notice', 'info', 'info'],
			['scheduled', 'maintenance', 'scheduled'],
			['stateless', 'maintenance', null]
		]);
	});

	it('keys an incident and a maintenance with the same id apart', () => {
		const status = view({ incidents: [{ id: 1 }, {}], maintenances: [{ id: 1 }, {}] });
		expect(status.entries.map((e) => e.key).toSorted()).toEqual([
			'Incident-at-1',
			'Incident-id-1',
			'Maintenance-at-1',
			'Maintenance-id-1'
		]);
	});

	it('has no age without a readable time, and never a negative one', () => {
		const status = view({
			incidents: [
				{ id: 1, updated_at: 'yesterday', created_at: null },
				// Ahead of the server's clock: just now, not in the future.
				{ id: 2, updated_at: '2026-11-09T04:00:00Z' }
			],
			maintenances: []
		});
		expect(status.entries.map((e) => e.age)).toEqual([null, { event: 'updated', seconds: 0 }]);
	});
});

describe('allRunning and statusHeadline', () => {
	it('is all clear with nothing open', () => {
		const ok = view(fixtureBody('/v1/lol/status/oc1'));
		expect(ok).toEqual({ incidents: 0, maintenances: 0, entries: [] });
		expect(allRunning(ok)).toBe(true);
		expect(statusHeadline(ok)).toBe('All services running');
	});

	it('counts what is open', () => {
		const kr = view(fixtureBody('/v1/lol/status/kr'));
		expect(allRunning(kr)).toBe(false);
		expect(statusHeadline(kr)).toBe('2 incidents · 1 maintenance');
		expect(statusHeadline(view({ incidents: [{}], maintenances: [] }))).toBe('1 incident');
		expect(statusHeadline(view({ incidents: [], maintenances: [{}, {}] }))).toBe('2 maintenances');
	});
});

describe('riotStatusUrl', () => {
	it("is Riot's status page for the platform, in English", () => {
		expect(riotStatusUrl('oc1')).toBe('https://status.riotgames.com/lol?region=oc1&locale=en_US');
		expect(riotStatusUrl('kr')).toBe('https://status.riotgames.com/lol?region=kr&locale=en_US');
	});
});

describe('fetchedAge', () => {
	it('reads whole non-negative seconds only', () => {
		expect(fetchedAge('180')).toBe(180);
		expect(fetchedAge('0')).toBe(0);
		for (const header of ['', '-1', 'abc', '1.5', null]) expect(fetchedAge(header)).toBeNull();
	});
});
