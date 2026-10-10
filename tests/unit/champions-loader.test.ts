import { isHttpError } from '@sveltejs/kit';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { loadChampions } from '#lib/server/champions.ts';
import { createProxyClient } from '#lib/server/proxy.ts';
import { clearStaticNames } from '#lib/server/static-data.ts';
import { loadFixtures } from '../mock-proxy/mock.ts';

const fixtures = loadFixtures();
const json = (status: number, body: unknown) =>
	new Response(JSON.stringify(body), {
		status,
		headers: { 'content-type': 'application/json' }
	});

/** A client answering from fixtures, with some paths overridden; records what it was asked. */
function client(override: (path: string) => Response | undefined = () => undefined) {
	const asked: string[] = [];
	const proxy = createProxyClient('http://proxy.test', undefined, async (request) => {
		const url = new URL(request.url);
		const path = url.pathname + url.search;
		asked.push(path);
		const custom = override(path);
		if (custom) return custom;
		const f = fixtures.find((x) => x.request.path === path);
		return json(f?.response.status ?? 500, f?.response.body ?? {});
	});
	return { proxy, asked };
}

beforeEach(() => {
	clearStaticNames();
	vi.restoreAllMocks();
});

describe('loadChampions', () => {
	it('loads the summed rows for a role and patch, the patch list and the icon version', async () => {
		const { proxy, asked } = client();
		const page = await loadChampions({ role: 'mid', patch: 'all' }, { client: proxy });

		expect(asked).toContain(
			'/v1/lol/analytics/champions?queue=RANKED_SOLO_5x5&patch=all&role=MIDDLE&limit=500'
		);
		expect(page.table.rows.length).toBeGreaterThan(100);
		expect(page.patches[0]).toBe('16.20');
		expect(page.ddragonVersion).toBe('16.20.1');
	});

	it('still loads without the patch list', async () => {
		vi.spyOn(console, 'error').mockImplementation(() => {});
		const { proxy } = client((path) =>
			path.startsWith('/v1/lol/analytics/patches') ? json(503, {}) : undefined
		);
		const page = await loadChampions({ role: null, patch: 'all' }, { client: proxy });
		expect(page.patches).toEqual([]);
		expect(page.table.rows.length).toBeGreaterThan(100);
	});

	it('fails when the table fails', async () => {
		const { proxy } = client((path) =>
			path.startsWith('/v1/lol/analytics/champions') ? json(503, {}) : undefined
		);
		const failure = await loadChampions({ role: null, patch: 'all' }, { client: proxy }).catch(
			(e: unknown) => e
		);
		expect(isHttpError(failure) && failure.status).toBe(503);
	});
});
