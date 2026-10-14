import { afterEach, describe, expect, it, vi } from 'vitest';
import { SLOW_ANALYTICS_MS, createProxyClient } from '#lib/server/proxy.ts';

const BASE = 'http://proxy.test:8080';

function stubFetch(status = 200, headers: Record<string, string> = {}) {
	const requests: Request[] = [];
	const fetch = async (request: Request) => {
		requests.push(request);
		return new Response(JSON.stringify({ ok: status < 400 }), {
			status,
			headers: { 'content-type': 'application/json', ...headers }
		});
	};
	return { fetch, requests };
}

afterEach(() => {
	vi.restoreAllMocks();
});

describe('createProxyClient', () => {
	it('sends the key as a Bearer token when one is set', async () => {
		const { fetch, requests } = stubFetch();
		await createProxyClient(BASE, 'placeholder-key', fetch).GET('/healthz');

		expect(requests[0].url).toBe(`${BASE}/healthz`);
		expect(requests[0].headers.get('authorization')).toBe('Bearer placeholder-key');
	});

	it('sends no Authorization header without a key', async () => {
		const { fetch, requests } = stubFetch();
		await createProxyClient(BASE, undefined, fetch).GET('/healthz');

		expect(requests[0].headers.has('authorization')).toBe(false);
	});

	it("logs a failed call with riot-proxy's request id", async () => {
		const log = vi.spyOn(console, 'error').mockImplementation(() => {});
		const { fetch } = stubFetch(404, { 'x-request-id': '01TESTREQUESTID' });
		await createProxyClient(BASE, undefined, fetch).GET('/healthz');

		expect(log).toHaveBeenCalledWith('proxy 404 GET /healthz request-id=01TESTREQUESTID');
	});

	it('does not log a successful call', async () => {
		const log = vi.spyOn(console, 'error').mockImplementation(() => {});
		const { fetch } = stubFetch(200);
		await createProxyClient(BASE, undefined, fetch).GET('/healthz');

		expect(log).not.toHaveBeenCalled();
	});
});

describe('logSlowAnalytics', () => {
	const ANALYTICS = '/v1/lol/analytics/patches';

	/** Each call to performance.now() moves the clock on by `step` ms. */
	function clock(step: number) {
		let now = 0;
		vi.spyOn(performance, 'now').mockImplementation(() => (now += step));
	}

	it('logs a slow analytics call with its x-cache', async () => {
		const log = vi.spyOn(console, 'warn').mockImplementation(() => {});
		clock(SLOW_ANALYTICS_MS + 50);
		const { fetch } = stubFetch(200, { 'x-cache': 'MISS' });
		await createProxyClient(BASE, undefined, fetch).GET(ANALYTICS, {
			params: { query: { queue: 'RANKED_SOLO_5x5' } }
		});

		expect(log).toHaveBeenCalledWith(
			`proxy slow GET ${ANALYTICS} x-cache=MISS ${SLOW_ANALYTICS_MS + 50}ms`
		);
	});

	it('does not log a fast call', async () => {
		const log = vi.spyOn(console, 'warn').mockImplementation(() => {});
		clock(1);
		const { fetch } = stubFetch(200, { 'x-cache': 'HIT' });
		await createProxyClient(BASE, undefined, fetch).GET(ANALYTICS, {
			params: { query: { queue: 'RANKED_SOLO_5x5' } }
		});

		expect(log).not.toHaveBeenCalled();
	});

	it('does not log other routes, however slow', async () => {
		const log = vi.spyOn(console, 'warn').mockImplementation(() => {});
		clock(SLOW_ANALYTICS_MS * 10);
		const { fetch } = stubFetch(200);
		await createProxyClient(BASE, undefined, fetch).GET('/v1/static/versions');

		expect(log).not.toHaveBeenCalled();
	});
});
