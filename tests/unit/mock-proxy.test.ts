import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { createProxyClient } from '#lib/server/proxy.ts';
import { createMockProxy, findFixture, loadFixtures } from '../mock-proxy/mock.ts';

const fixtures = loadFixtures();
const server = createMockProxy(fixtures);
let proxy: ReturnType<typeof createProxyClient>;

beforeAll(async () => {
	await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
	const { port } = server.address() as AddressInfo;
	proxy = createProxyClient(`http://127.0.0.1:${port}`, undefined);
});

afterAll(() => {
	server.close();
});

describe('fixtures', () => {
	it('match on method and exact path', () => {
		const path = '/v1/static/versions';
		expect(findFixture(fixtures, 'GET', path)?.response.status).toBe(200);
		expect(findFixture(fixtures, 'POST', path)).toBeUndefined();
		expect(findFixture(fixtures, 'GET', `${path}?version=1`)).toBeUndefined();
	});
});

// The real client against the mock: proves the client's path encoding matches
// the recorded fixture paths.
describe('mock proxy', () => {
	const account = '/v1/riot/accounts/by-riot-id/{region}/{gameName}/{tagLine}' as const;

	it('replays a found account', async () => {
		const { data, response } = await proxy.GET(account, {
			params: { path: { region: 'asia', gameName: 'Hide on bush', tagLine: 'KR1' } }
		});
		expect(response.status).toBe(200);
		expect(data).toMatchObject({ gameName: 'Hide on bush', tagLine: 'KR1' });
	});

	it("replays riot-proxy's not-found envelope", async () => {
		vi.spyOn(console, 'error').mockImplementation(() => {});
		const { error, response } = await proxy.GET(account, {
			params: { path: { region: 'asia', gameName: 'NoSuchPlayer000', tagLine: 'XXXX' } }
		});
		expect(response.status).toBe(404);
		expect(error).toMatchObject({ error: { code: 'NOT_FOUND' } });
	});

	it('answers a request with no fixture with a 500', async () => {
		vi.spyOn(console, 'error').mockImplementation(() => {});
		const { response } = await proxy.GET('/healthz');
		expect(response.status).toBe(500);
	});
});
