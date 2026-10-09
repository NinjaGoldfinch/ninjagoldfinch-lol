import { afterEach, describe, expect, it, vi } from 'vitest';
import { createProxyClient } from '#lib/server/proxy.ts';

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
