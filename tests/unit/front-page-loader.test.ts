import { beforeEach, describe, expect, it, vi } from 'vitest';
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
		return json(f?.response.status ?? 500, f?.response.body ?? {});
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
		const page = await loadFrontPage(clients(undefined, cards.fetch));

		expect(cards.asked).toEqual([ANALYTICS]);
		expect(page.totalGames).toBe(211590);
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
		expect(page.complete).toBe(true);
	});

	it('shows the rest of the page when the analytics call fails', async () => {
		const log = vi.spyOn(console, 'error').mockImplementation(() => {});
		const page = await loadFrontPage(
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
		const page = await loadFrontPage(clients(undefined, hang, 50));

		expect(performance.now() - started).toBeLessThan(1_000);
		expect(page.topWinRates).toBeNull();
		expect(page.patchLabel).toBe('16.20');
		expect(page.complete).toBe(false);
		expect(log).toHaveBeenCalledWith(`proxy timeout GET /v1/lol/analytics/champions after 50 ms`);
	});

	it('still answers without the patch: no pill, no icons', async () => {
		vi.spyOn(console, 'error').mockImplementation(() => {});
		const page = await loadFrontPage(
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
