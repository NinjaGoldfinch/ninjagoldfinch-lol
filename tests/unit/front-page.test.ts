import { afterEach, describe, expect, it, vi } from 'vitest';
import { toChampionTable, type ChampionRow } from '#lib/domain/champion-stats.ts';
import {
	DEFAULT_REGION,
	EXAMPLE_SEARCHES,
	FRONT_REGIONS,
	FRONT_CARD,
	GAMES_FLOORS,
	TOP_WIN_RATE_MIN_GAMES,
	cardFields,
	cardHeading,
	cardScope,
	allRunning,
	fetchedAge,
	formatCount,
	frontQuery,
	gamesAnalysed,
	gamesFloor,
	isFrontFilter,
	parseFrontCard,
	parseStatus,
	pickRegion,
	rateBar,
	regionFields,
	riotStatusUrl,
	statusHeadline,
	statusView,
	topChampions,
	winRateBar,
	type PlatformStatus
} from '#lib/domain/front-page.ts';
import { REGIONS, findRegion } from '#lib/domain/regions.ts';
import type { components } from '#lib/api/schema.d.ts';
import { championStatsWithDefault } from './champion-stats-default.ts';
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

/** A row with only what the card reads; rates 0–1. */
function row(
	name: string,
	games: number,
	winRate = 0.5,
	pickRate: number | null = 0.1,
	banRate: number | null = 0.05
): ChampionRow {
	return { id: games, key: null, name, games, winRate, pickRate, banRate };
}

/** `n` rows of `games` games each. */
const rows = (n: number, games: number) => Array.from({ length: n }, (_, i) => row(`C${i}`, games));

describe('topChampions', () => {
	it('lists the six highest win rates over 800 games, highest first', () => {
		const top = topChampions(recordedTable());
		expect(top.rows.map((r) => r.name)).toEqual([
			'Taliyah',
			'Gragas',
			'Riven',
			'Janna',
			"Vel'Koz",
			'Nocturne'
		]);
		expect(top.minGames).toBe(TOP_WIN_RATE_MIN_GAMES);
		expect(top.patch).toBe('all');
		expect(top.rows.every((r) => r.games >= 800)).toBe(true);
		const rates = top.rows.map((r) => r.winRate);
		expect(rates).toEqual(rates.toSorted((a, b) => b - a));
	});

	it('ranks by pick or ban rate over the same floor', () => {
		const table = recordedTable();
		for (const sort of ['pick', 'ban'] as const) {
			const top = topChampions(table, sort);
			const rate = (r: ChampionRow) => (sort === 'pick' ? r.pickRate : r.banRate) ?? -1;
			const best = table.rows
				.filter((r) => r.games >= 800)
				.toSorted((a, b) => rate(b) - rate(a))
				.slice(0, 6);
			expect(top.rows.map(rate)).toEqual(best.map(rate));
			expect(top.minGames).toBe(800);
		}
	});

	it('lowers the floor until six champions reach it, never under 100', () => {
		const table = { patch: '16.20', rows: [...rows(3, 900), ...rows(2, 450), row('Small', 250)] };
		const top = topChampions(table);
		expect(top.minGames).toBe(200);
		expect(top.rows).toHaveLength(6);

		const thin = topChampions({ patch: '16.20', rows: [...rows(2, 150), ...rows(9, 99)] });
		expect(thin.minGames).toBe(100);
		expect(thin.rows).toHaveLength(2);
	});

	it('lists as many as asked', () => {
		expect(topChampions(recordedTable(), 'win', 2).rows.map((r) => r.name)).toEqual([
			'Taliyah',
			'Gragas'
		]);
	});
});

describe('gamesFloor', () => {
	it('is the highest step six champions reach', () => {
		expect(GAMES_FLOORS).toEqual([800, 400, 200, 100]);
		expect(gamesFloor(rows(6, 800))).toBe(800);
		expect(gamesFloor([...rows(5, 800), row('x', 799)])).toBe(400);
		expect(gamesFloor(rows(6, 399))).toBe(200);
		expect(gamesFloor(rows(6, 100))).toBe(100);
	});

	it('is the lowest step when too few reach any', () => {
		expect(gamesFloor([])).toBe(100);
		expect(gamesFloor(rows(5, 5000))).toBe(100);
	});

	it('counts as many champions as the card lists', () => {
		expect(gamesFloor(rows(2, 800), 2)).toBe(800);
	});
});

describe('the card in the query', () => {
	const params = (query: string) => new URLSearchParams(query);

	it('is the default slice, by win rate, when the query names nothing', () => {
		expect(parseFrontCard(params(''))).toEqual(FRONT_CARD);
		expect(FRONT_CARD).toEqual({
			filter: { role: null, rank: null, patch: 'all' },
			sort: 'win'
		});
		expect(cardFields(FRONT_CARD)).toEqual([]);
	});

	it("reads /champions' words: role, rank, patch=newest and sort", () => {
		const card = parseFrontCard(params('role=mid&rank=diamond+&patch=newest&sort=ban'));
		expect(card).toEqual({
			filter: { role: 'mid', rank: { tier: 'diamond', andAbove: true }, patch: null },
			sort: 'ban'
		});
		expect(cardFields(card)).toEqual([
			['role', 'mid'],
			['rank', 'diamond+'],
			['patch', 'newest'],
			['sort', 'ban']
		]);
	});

	it('offers this patch or every patch, not a patch by number', () => {
		expect(parseFrontCard(params('patch=16.19')).filter.patch).toBe('all');
		expect(parseFrontCard(params('patch=all')).filter.patch).toBe('all');
	});

	it('falls back to the defaults for anything else', () => {
		expect(parseFrontCard(params('role=feeder&rank=wood&sort=kda&patch=next'))).toEqual(FRONT_CARD);
		expect(parseFrontCard(params('sort=win')).sort).toBe('win');
	});

	it('is in a canonical query with the region, defaults left out, `+` unencoded', () => {
		const korea = findRegion('kr');
		if (!korea) throw new Error('no Korea');
		const card = parseFrontCard(params('sort=pick&rank=emerald+&role=top&patch=newest'));
		expect(frontQuery(korea, card)).toBe(
			'?region=kr&role=top&rank=emerald+&patch=newest&sort=pick'
		);
		expect(frontQuery(DEFAULT_REGION, card)).toBe('?role=top&rank=emerald+&patch=newest&sort=pick');
		expect(frontQuery(korea, FRONT_CARD)).toBe('?region=kr');
		expect(regionFields(DEFAULT_REGION)).toEqual([]);
		expect(regionFields(korea)).toEqual([['region', 'kr']]);
	});

	it('knows the default slice, which the games-analysed pill counts', () => {
		expect(isFrontFilter(FRONT_CARD.filter)).toBe(true);
		for (const query of ['role=mid', 'rank=iron', 'patch=newest']) {
			expect(isFrontFilter(parseFrontCard(params(query)).filter), query).toBe(false);
		}
		// The order is not the slice.
		expect(isFrontFilter(parseFrontCard(params('sort=pick')).filter)).toBe(true);
	});
});

describe.each(['all', 'newest'] as const)(
	"the card's default with /champions' DEFAULT_PATCH at %s (ADR-077)",
	(defaultPatch) => {
		const params = (query: string) => new URLSearchParams(query);

		afterEach(() => {
			vi.doUnmock('#lib/domain/champion-stats.ts');
			vi.resetModules();
		});

		async function frontPage() {
			vi.resetModules();
			vi.doMock('#lib/domain/champion-stats.ts', () => championStatsWithDefault(defaultPatch));
			const champions = await import('#lib/domain/champion-stats.ts');
			// The switch reached the module the card imports: /champions' own
			// default follows it.
			expect(champions.DEFAULT_PATCH).toBe(defaultPatch);
			expect(champions.parseChampionFilter(params('')).patch).toBe(
				defaultPatch === 'all' ? 'all' : null
			);
			return import('#lib/domain/front-page.ts');
		}

		it('is all patches, written as no field, and is the default slice', async () => {
			const front = await frontPage();
			expect(front.FRONT_CARD.filter.patch).toBe('all');
			expect(front.parseFrontCard(params(''))).toEqual(front.FRONT_CARD);
			expect(front.cardFields(front.FRONT_CARD)).toEqual([]);
			expect(front.frontQuery(DEFAULT_REGION, front.FRONT_CARD)).toBe('');
			expect(front.isFrontFilter(front.parseFrontCard(params('')).filter)).toBe(true);
			expect(front.isFrontFilter(front.parseFrontCard(params('sort=pick')).filter)).toBe(true);
		});

		it('reads and writes `patch=newest` for this patch, and anything else as all patches', async () => {
			const front = await frontPage();
			for (const query of ['patch=all', 'patch=16.19', 'patch=next']) {
				const card = front.parseFrontCard(params(query));
				expect(card.filter.patch, query).toBe('all');
				expect(front.cardFields(card), query).toEqual([]);
				expect(front.isFrontFilter(card.filter), query).toBe(true);
			}
			const card = front.parseFrontCard(params('sort=ban&patch=newest&rank=diamond+&role=mid'));
			expect(card).toEqual({
				filter: { role: 'mid', rank: { tier: 'diamond', andAbove: true }, patch: null },
				sort: 'ban'
			});
			expect(front.cardFields(card)).toEqual([
				['role', 'mid'],
				['rank', 'diamond+'],
				['patch', 'newest'],
				['sort', 'ban']
			]);
			expect(front.isFrontFilter(front.parseFrontCard(params('patch=newest')).filter)).toBe(false);
		});

		it('round-trips through its canonical query', async () => {
			const front = await frontPage();
			const korea = findRegion('kr');
			if (!korea) throw new Error('no Korea');
			for (const query of ['', 'patch=newest', 'role=top&rank=emerald+&patch=newest&sort=pick']) {
				const card = front.parseFrontCard(params(query));
				const canonical = front.frontQuery(korea, card);
				expect(front.parseFrontCard(params(canonical.slice(1))), query).toEqual(card);
				expect(canonical, query).toBe(`?region=kr${query ? `&${query}` : ''}`);
			}
		});
	}
);

describe("the card's words", () => {
	it('names its sort', () => {
		expect(cardHeading('win')).toBe('Top win rate');
		expect(cardHeading('pick')).toBe('Top pick rate');
		expect(cardHeading('ban')).toBe('Top ban rate');
	});

	it('says what the rows count, with the patch riot-proxy named', () => {
		expect(cardScope(FRONT_CARD.filter, 'all')).toBe('All patches');
		const card = parseFrontCard(new URLSearchParams('role=support&rank=master+&patch=newest'));
		expect(cardScope(card.filter, '16.20')).toBe('Patch 16.20 · Support · Master+');
		expect(cardScope(card.filter, null)).toBe('Newest patch · Support · Master+');
	});
});

describe('rateBar', () => {
	const top = [
		row('A', 900, 0.6, 0.2, 0.4),
		row('B', 900, 0.525, 0.05, 0.1),
		row('C', 900, 0.5, null, null)
	];

	it('puts win rates on the fixed scale', () => {
		expect(rateBar(top[1], 'win', top)).toBe(50);
	});

	it("measures pick and ban rates against the card's highest", () => {
		expect(rateBar(top[0], 'pick', top)).toBe(100);
		expect(rateBar(top[1], 'pick', top)).toBe(25);
		expect(rateBar(top[1], 'ban', top)).toBe(25);
		expect(rateBar(top[2], 'ban', top)).toBe(0);
		expect(rateBar(top[2], 'ban', [top[2]])).toBe(0);
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

	it('is the one posted last, by `created_at`, whatever its place in the list', () => {
		expect(
			update([
				{ translations: text('first'), created_at: '2026-11-09T01:00:00Z' },
				{ translations: text('newest'), created_at: '2026-11-09T03:00:00Z' },
				{ translations: text('second'), created_at: '2026-11-09T02:00:00Z' }
			])
		).toBe('newest');
	});

	it('is the one posted last, not an older one edited since (ADR-078)', () => {
		// Riot fixes a typo in A after posting B: A's `updated_at` is the later.
		const a = {
			translations: text('Investigating'),
			created_at: '2026-11-09T01:00:00Z',
			updated_at: '2026-11-09T03:30:00Z'
		};
		const b = {
			translations: text('A fix is rolling out'),
			created_at: '2026-11-09T03:00:00Z',
			updated_at: '2026-11-09T03:00:00Z'
		};
		expect(update([a, b])).toBe('A fix is rolling out');
		expect(update([b, a])).toBe('A fix is rolling out');
	});

	it('goes by `updated_at` without `created_at`, and counts one without a time as the oldest', () => {
		expect(
			update([
				{ translations: text('no time') },
				{ translations: text('updated'), created_at: null, updated_at: '2026-11-09T01:00:00Z' },
				{ translations: text('not a time'), created_at: 'soon' }
			])
		).toBe('updated');
		// Against another update's `created_at`, the fallback is its time.
		expect(
			update([
				{ translations: text('posted'), created_at: '2026-11-09T01:00:00Z' },
				{ translations: text('edited later'), updated_at: '2026-11-09T02:00:00Z' }
			])
		).toBe('edited later');
		// With no times at all, the first in the list.
		expect(update([{ translations: text('a') }, { translations: text('b') }])).toBe('a');
	});

	it('goes to the first in the list of two posted at the same time', () => {
		const at = '2026-11-09T01:00:00Z';
		// The second was edited later; ranked by `updated_at` first, it would win.
		expect(
			update([
				{ translations: text('two'), created_at: at },
				{ translations: text('one'), created_at: at, updated_at: '2026-11-09T02:00:00Z' }
			])
		).toBe('two');
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

	it('lists the worst first: critical, warnings and maintenance not known to be scheduled, notices, then scheduled maintenance', () => {
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
				// A maintenance with no state, or one the site does not know, may be
				// under way: a warning, as an incident of unknown severity (ADR-078).
				{ id: 7, titles: titled('stateless') },
				{ id: 8, maintenance_status: 'delayed', titles: titled('unknown state') }
			]
		});
		expect(status.entries.map((e) => [e.title, e.tone, e.state])).toEqual([
			['critical', 'critical', 'critical'],
			['warning', 'warning', 'warning'],
			['unknown', 'warning', null],
			['under way', 'warning', 'in progress'],
			['stateless', 'warning', null],
			['unknown state', 'warning', 'delayed'],
			['notice', 'info', 'info'],
			['scheduled', 'maintenance', 'scheduled']
		]);
	});

	it('shows a maintenance with no status as a warning, ahead of a notice (ADR-078)', () => {
		const status = view({
			incidents: [
				{ id: 1, incident_severity: 'info', titles: [{ locale: 'en_US', content: 'Notice' }] }
			],
			maintenances: [
				{
					id: 2,
					maintenance_status: 'scheduled',
					titles: [{ locale: 'en_US', content: 'Patch 16.21' }]
				},
				{
					id: 3,
					titles: [{ locale: 'en_US', content: 'Store maintenance' }],
					updated_at: '2026-11-09T02:10:00Z'
				}
			]
		});
		expect(status.entries[0]).toEqual({
			key: 'Maintenance-id-3',
			kind: 'Maintenance',
			title: 'Store maintenance',
			state: null,
			tone: 'warning',
			update: null,
			age: { event: 'updated', seconds: 3600 }
		});
		expect(status.entries.map((e) => [e.key, e.tone])).toEqual([
			['Maintenance-id-3', 'warning'],
			['Incident-id-1', 'info'],
			['Maintenance-id-2', 'maintenance']
		]);
		expect(statusHeadline(status)).toBe('1 incident · 2 maintenances');
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
