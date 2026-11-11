import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_REGION, allRunning } from '#lib/domain/front-page.ts';
import { findRegion } from '#lib/domain/regions.ts';
import { loadFrontPage } from '#lib/server/front-page.ts';
import { createProxyClient } from '#lib/server/proxy.ts';
import { clearStaticNames } from '#lib/server/static-data.ts';
import { clearPatchVersions } from '#lib/server/patch.ts';
import { loadFixtures } from '../mock-proxy/mock.ts';

const fixtures = loadFixtures();
const json = (status: number, body: unknown) =>
	new Response(JSON.stringify(body), {
		status,
		headers: { 'content-type': 'application/json' }
	});

const OCEANIA = DEFAULT_REGION;

const ANALYTICS =
	'/v1/lol/analytics/champions?queue=RANKED_SOLO_5x5&patch=all&minGames=0&limit=500';

type Fetch = (request: Request) => Promise<Response>;

/** A fetch answering from fixtures, with some paths overridden; records what it was asked. */
function answering(override: (path: string) => Response | undefined = () => undefined) {
	const asked: string[] = [];
	const fetch: Fetch = async (request) => {
		const url = new URL(request.url);
		const path = url.pathname + url.search;
		asked.push(path);
		const custom = override(path);
		if (custom) return custom;
		const f = fixtures.find((x) => x.request.path === path);
		if (!f) return json(500, {});
		// With the recorded headers: the status card reads X-Cache-Fetched-Age.
		return new Response(JSON.stringify(f.response.body), {
			status: f.response.status,
			headers: { 'content-type': 'application/json', ...f.response.headers }
		});
	};
	return { fetch, asked };
}

/** The page's clients, both answering from fixtures; `budget` is the cards' deadline. */
function clients(
	override?: (path: string) => Response | undefined,
	fetch: Fetch = answering(override).fetch,
	budget = 2_000
) {
	return {
		client: createProxyClient('http://proxy.test', undefined, answering(override).fetch),
		cards: createProxyClient('http://proxy.test', undefined, fetch, () => budget)
	};
}

/** A riot-proxy that never answers, as a real fetch does until its signal aborts. */
const hang: Fetch = (request) =>
	new Promise<Response>((_, reject) => {
		if (request.signal.aborted) reject(request.signal.reason);
		request.signal.addEventListener('abort', () => reject(request.signal.reason));
	});

beforeEach(() => {
	clearStaticNames();
	clearPatchVersions();
	vi.restoreAllMocks();
});

describe('loadFrontPage', () => {
	it('loads the patch, the games analysed and the top win rates', async () => {
		const cards = answering();
		const page = await loadFrontPage(OCEANIA, clients(undefined, cards.fetch));

		// No free rotation: the front page dropped its card (ADR-076).
		expect(cards.asked.toSorted()).toEqual([ANALYTICS, '/v1/lol/status/oc1'].toSorted());
		expect(page).not.toHaveProperty('rotation');
		// riot-proxy's `totalGames` is 211590 participant games: ten a game (ADR-074).
		expect(page.totalGames).toBe(21159);
		expect(page.topWinRates?.map((r) => r.name)).toEqual([
			'Taliyah',
			'Gragas',
			'Riven',
			'Janna',
			"Vel'Koz",
			'Nocturne'
		]);
		expect(page.patch).toBe('16.20.1');
		expect(page.patchLabel).toBe('16.20');
		expect(page.championNames).toContain('Taliyah');
		expect(page.region).toEqual({ slug: 'oce', label: 'Oceania' });
		expect(page.status).toEqual({ incidents: 0, maintenances: 0, entries: [] });
		expect(page.statusPage).toBe('https://status.riotgames.com/lol?region=oc1&locale=en_US');
		expect(page.statusCheckedSeconds).toBe(180);
		expect(page.complete).toBe(true);
	});

	it("asks for another region's status", async () => {
		const korea = findRegion('kr');
		if (!korea) throw new Error('no Korea');
		vi.spyOn(console, 'error').mockImplementation(() => {});
		const cards = answering();
		// Two hours after the fixture's warning incident was last updated.
		const now = () => Date.parse('2026-11-09T03:10:00Z');
		const page = await loadFrontPage(korea, { ...clients(undefined, cards.fetch), now });

		expect(cards.asked.toSorted()).toEqual([ANALYTICS, '/v1/lol/status/kr'].toSorted());
		expect(page.region).toEqual({ slug: 'kr', label: 'Korea' });
		// The fixture's incident without a title is kept, under a generic one.
		expect(page.status?.entries.map((e) => e.title)).toEqual([
			'Ranked queues are disabled',
			'Incident',
			'Scheduled maintenance for patch 16.21'
		]);
		expect(page.status).toMatchObject({ incidents: 2, maintenances: 1 });
		// Ages are counted from the loader's clock, on the server (ADR-075).
		expect(page.status?.entries[0]).toMatchObject({
			update: 'Ranked queues are disabled while we investigate an issue.',
			age: { event: 'updated', seconds: 7200 }
		});
		expect(page.statusPage).toBe('https://status.riotgames.com/lol?region=kr&locale=en_US');
		expect(page.complete).toBe(true);
	});

	it('logs a status payload it cannot read, and leaves the card out', async () => {
		const log = vi.spyOn(console, 'error').mockImplementation(() => {});
		const page = await loadFrontPage(
			OCEANIA,
			clients((path) => (path === '/v1/lol/status/oc1' ? json(200, { nope: 1 }) : undefined))
		);

		expect(page.status).toBeNull();
		expect(page.statusCheckedSeconds).toBeNull();
		// The card still links to Riot's own page.
		expect(page.statusPage).toBe('https://status.riotgames.com/lol?region=oc1&locale=en_US');
		expect(page.topWinRates).toHaveLength(6);
		expect(page.complete).toBe(false);
		expect(log).toHaveBeenCalledWith('front page: unexpected status payload for oc1');
	});

	it('keeps a status entry without a title, logs it, and does not show all clear', async () => {
		const log = vi.spyOn(console, 'error').mockImplementation(() => {});
		const page = await loadFrontPage(
			OCEANIA,
			clients((path) =>
				path === '/v1/lol/status/oc1'
					? json(200, {
							incidents: [{ id: 1, incident_severity: 'critical', titles: [] }],
							maintenances: []
						})
					: undefined
			)
		);

		expect(page.status?.entries.map((e) => [e.title, e.state, e.tone])).toEqual([
			['Incident', 'critical', 'critical']
		]);
		expect(page.status && allRunning(page.status)).toBe(false);
		expect(log).toHaveBeenCalledWith(
			'front page: status entries shown with a fallback for oc1: incident id-1 missing title'
		);
	});

	it('keeps a status entry without a usable id, and logs it', async () => {
		const log = vi.spyOn(console, 'error').mockImplementation(() => {});
		const page = await loadFrontPage(
			OCEANIA,
			clients((path) =>
				path === '/v1/lol/status/oc1'
					? json(200, {
							incidents: [],
							maintenances: [
								{
									id: '42',
									maintenance_status: 'in_progress',
									titles: [{ locale: 'en_US', content: 'Store maintenance' }]
								}
							]
						})
					: undefined
			)
		);

		expect(page.status?.entries.map((e) => [e.key, e.title, e.state])).toEqual([
			['Maintenance-at-0', 'Store maintenance', 'in progress']
		]);
		expect(page.status && allRunning(page.status)).toBe(false);
		expect(log).toHaveBeenCalledWith(
			'front page: status entries shown with a fallback for oc1: maintenance at-0 missing id'
		);
	});

	it("logs Korea's fixture incident without a title", async () => {
		const log = vi.spyOn(console, 'error').mockImplementation(() => {});
		const korea = findRegion('kr');
		if (!korea) throw new Error('no Korea');
		await loadFrontPage(korea, clients());
		expect(log).toHaveBeenCalledWith(
			'front page: status entries shown with a fallback for kr: incident id-9103 missing title'
		);
	});

	it('does not log a status feed it could read whole', async () => {
		const log = vi.spyOn(console, 'error').mockImplementation(() => {});
		await loadFrontPage(OCEANIA, clients());
		expect(log.mock.calls.flat().join(' ')).not.toContain('status entries');
	});

	it('gives up on a status that never answers, keeping the other cards', async () => {
		vi.spyOn(console, 'error').mockImplementation(() => {});
		const cards = answering();
		const fetch = (request: Request) =>
			new URL(request.url).pathname === '/v1/lol/status/oc1' ? hang(request) : cards.fetch(request);
		const started = performance.now();
		const page = await loadFrontPage(OCEANIA, clients(undefined, fetch, 50));

		expect(performance.now() - started).toBeLessThan(200);
		expect(page.status).toBeNull();
		expect(page.totalGames).toBe(21159);
		expect(page.topWinRates).toHaveLength(6);
		expect(page.complete).toBe(false);
	});

	it('shows the rest of the page when the analytics call fails', async () => {
		const log = vi.spyOn(console, 'error').mockImplementation(() => {});
		const page = await loadFrontPage(
			OCEANIA,
			clients((path) => (path === ANALYTICS ? json(503, {}) : undefined))
		);

		expect(page.totalGames).toBeNull();
		expect(page.topWinRates).toBeNull();
		expect(page.patchLabel).toBe('16.20');
		expect(page.complete).toBe(false);
		expect(log).toHaveBeenCalledWith('front page: analytics unavailable:', 503);
	});

	it('shows the rest of the page when the analytics call throws', async () => {
		vi.spyOn(console, 'error').mockImplementation(() => {});
		const page = await loadFrontPage(
			OCEANIA,
			clients((path) => {
				if (path === ANALYTICS) throw new TypeError('fetch failed');
				return undefined;
			})
		);

		expect(page.topWinRates).toBeNull();
		expect(page.totalGames).toBeNull();
		expect(page.complete).toBe(false);
	});

	it('gives up on a card that does not answer within the deadline', async () => {
		const log = vi.spyOn(console, 'error').mockImplementation(() => {});
		const started = performance.now();
		const page = await loadFrontPage(OCEANIA, clients(undefined, hang, 50));

		expect(performance.now() - started).toBeLessThan(1_000);
		expect(page.topWinRates).toBeNull();
		expect(page.patchLabel).toBe('16.20');
		expect(page.complete).toBe(false);
		expect(log).toHaveBeenCalledWith(`proxy timeout GET /v1/lol/analytics/champions after 50 ms`);
	});

	it('still answers without the patch: no pill, no icons', async () => {
		vi.spyOn(console, 'error').mockImplementation(() => {});
		const page = await loadFrontPage(
			OCEANIA,
			clients((path) => (path === '/v1/static/versions' ? json(503, {}) : undefined))
		);

		expect(page.patch).toBeNull();
		expect(page.patchLabel).toBeNull();
		expect(page.championNames).toEqual([]);
		// riot-proxy's own names stand in for Data Dragon's.
		expect(page.topWinRates?.[0]?.name).toBe('Taliyah');
		expect(page.topWinRates?.[0]?.key).toBeNull();
		expect(page.complete).toBe(false);
	});
});
