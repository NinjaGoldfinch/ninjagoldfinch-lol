import { afterEach, describe, expect, it, vi } from 'vitest';
import { createProxyClient } from '#lib/server/proxy.ts';
import {
	NO_NAMES,
	clearStaticNames,
	namesOrFallback,
	staticNames
} from '#lib/server/static-data.ts';
import { findFixture, loadFixtures } from '../mock-proxy/mock.ts';

const fixtures = loadFixtures();

/** A client that answers from fixtures and counts requests. */
function countingClient(status?: number) {
	let requests = 0;
	const client = createProxyClient('http://proxy.test', undefined, async (request) => {
		requests += 1;
		const url = new URL(request.url);
		const fixture = findFixture(fixtures, 'GET', url.pathname + url.search);
		return new Response(JSON.stringify(fixture?.response.body ?? {}), {
			status: status ?? fixture?.response.status ?? 500,
			headers: { 'content-type': 'application/json' }
		});
	});
	return { client, requests: () => requests };
}

afterEach(() => {
	clearStaticNames();
	vi.restoreAllMocks();
});

describe('staticNames', () => {
	it('fetches the five files once per patch', async () => {
		const { client, requests } = countingClient();
		const first = await staticNames('16.20.1', client);
		await staticNames('16.20.1', client);

		expect(requests()).toBe(5);
		expect(first.champions[103].id).toBe('Ahri');
		expect(first.queues[420]).toBe('Ranked Solo');
		expect(first.runes[8112].name).toBe('Electrocute');
	});

	it('does not keep a failed fetch', async () => {
		vi.spyOn(console, 'error').mockImplementation(() => {});
		const failing = countingClient(503);
		await expect(staticNames('16.20.1', failing.client)).rejects.toThrow();

		const working = countingClient();
		await expect(staticNames('16.20.1', working.client)).resolves.toBeTruthy();
		expect(working.requests()).toBe(5);
	});
});

describe('namesOrFallback', () => {
	it('returns the lookups when they load', async () => {
		const { client } = countingClient();
		const { names, fellBack } = await namesOrFallback('16.20.1', client);

		expect(fellBack).toBe(false);
		expect(names.champions[103].id).toBe('Ahri');
	});

	it('falls back to NO_NAMES and logs when they fail', async () => {
		const log = vi.spyOn(console, 'error').mockImplementation(() => {});
		const { client } = countingClient(503);

		expect(await namesOrFallback('16.20.1', client)).toEqual({ names: NO_NAMES, fellBack: true });
		expect(log).toHaveBeenCalledWith(
			'Data Dragon lookups unavailable; using fallbacks:',
			expect.anything()
		);
	});
});
