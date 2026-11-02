import { afterEach, describe, expect, it, vi } from 'vitest';
import { createProxyClient } from '#lib/server/proxy.ts';
import { SLOW_LOAD_MS, timeLoad } from '#lib/server/timing.ts';

const BASE = 'http://proxy.test';
const PROFILE = '/v1/players/by-riot-id/{gameName}/{tagLine}/profile';
const MATCHES = '/v1/players/{puuid}/matches';

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** A riot-proxy answering each path after `delay` ms with `status`. */
function client(delay = 0, status: (path: string) => number = () => 200) {
	return createProxyClient(BASE, undefined, async (request) => {
		await sleep(delay);
		const { pathname } = new URL(request.url);
		return new Response(JSON.stringify({}), {
			status: status(pathname),
			headers: { 'content-type': 'application/json', 'x-cache': 'MISS' }
		});
	});
}

/** Two calls in order, as a profile load makes them. */
async function profileLoad(proxy: ReturnType<typeof client>, gameName = 'Hide on bush') {
	await proxy.GET(PROFILE, { params: { path: { gameName, tagLine: 'KR1' } } });
	await proxy.GET(MATCHES, {
		params: { path: { puuid: 'fixture-puuid-1' }, query: { platform: 'kr' } }
	});
}

afterEach(() => {
	vi.restoreAllMocks();
});

describe('timeLoad', () => {
	it('gives the threshold the plan sets', () => {
		expect(SLOW_LOAD_MS).toBe(100);
	});

	it('logs a slow load once, with its route id, each call by spec path and time, and the total', async () => {
		const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
		const result = await timeLoad(
			'/summoner/[riotId]',
			false,
			async () => {
				await profileLoad(client(5));
				return 'page';
			},
			0
		);

		expect(result).toBe('page');
		expect(warn).toHaveBeenCalledOnce();
		expect(warn.mock.calls[0][0]).toMatch(
			/^slow load \/summoner\/\[riotId\] \d+ms: GET \/v1\/players\/by-riot-id\/\{gameName\}\/\{tagLine\}\/profile \d+ms, GET \/v1\/players\/\{puuid\}\/matches \d+ms$/
		);
	});

	it('names no player and no x-cache', async () => {
		const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
		await timeLoad('/summoner/[riotId]', false, () => profileLoad(client()), 0);

		const line = String(warn.mock.calls[0][0]);
		expect(line).not.toMatch(/Hide|bush|KR1|fixture-puuid/);
		expect(line).not.toMatch(/x-cache|MISS/i);
	});

	it('logs nothing for a load under the threshold', async () => {
		const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
		await timeLoad('/champions', false, () => profileLoad(client()), 10_000);

		expect(warn).not.toHaveBeenCalled();
	});

	it('marks a data request, an error response and a call that got no answer', async () => {
		const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
		vi.spyOn(console, 'error').mockImplementation(() => {});
		const proxy = client(0, (path) => (path.endsWith('/profile') ? 404 : 200));
		const unreachable = createProxyClient(BASE, undefined, async () => {
			throw new TypeError('fetch failed');
		});

		await timeLoad(
			'/summoner/[riotId]',
			true,
			async () => {
				await profileLoad(proxy);
				await unreachable.GET('/healthz').catch(() => undefined);
			},
			0
		);

		const line = String(warn.mock.calls[0][0]);
		expect(line).toMatch(/^slow load \/summoner\/\[riotId\] \(data\) /);
		expect(line).toMatch(/\/profile \d+ms 404, /);
		expect(line).toMatch(/\/matches \d+ms, GET \/healthz \d+ms failed$/);
	});

	it('says so for a slow load without riot-proxy calls, or without a route', async () => {
		const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
		await timeLoad(null, false, () => sleep(1), 0);

		expect(warn).toHaveBeenCalledWith(
			expect.stringMatching(/^slow load \(no route\) \d+ms: no riot-proxy calls$/)
		);
	});

	it('logs a load that throws, and throws on', async () => {
		const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
		const failure = new Error('page failed');

		await expect(
			timeLoad(
				'/match/[matchId]',
				false,
				async () => {
					await profileLoad(client());
					throw failure;
				},
				0
			)
		).rejects.toBe(failure);
		expect(warn).toHaveBeenCalledOnce();
	});

	it('keeps the calls of loads running at the same time apart', async () => {
		const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
		const proxy = client(5);

		await Promise.all([
			timeLoad('/summoner/[riotId]', false, () => profileLoad(proxy), 0),
			timeLoad(
				'/champions',
				false,
				async () => {
					await proxy.GET('/v1/lol/analytics/champions', { params: { query: {} } });
				},
				0
			)
		]);

		const lines = warn.mock.calls.map((c) => String(c[0]));
		const profile = lines.find((l) => l.startsWith('slow load /summoner/'));
		const champions = lines.find((l) => l.startsWith('slow load /champions '));
		expect(profile).toMatch(/\/profile .*\/matches \d+ms$/);
		expect(profile).not.toContain('analytics');
		expect(champions).toMatch(/: GET \/v1\/lol\/analytics\/champions \d+ms$/);
	});

	it('records nothing for a call made outside a load', async () => {
		const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
		await profileLoad(client());

		expect(warn).not.toHaveBeenCalled();
	});
});
