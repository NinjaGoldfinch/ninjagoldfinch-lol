import type { AddressInfo } from 'node:net';
import { isHttpError } from '@sveltejs/kit';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { findRegion, type Region } from '#lib/domain/regions.ts';
import { loadProfile } from '#lib/server/profile.ts';
import { createProxyClient } from '#lib/server/proxy.ts';
import { clearStaticNames } from '#lib/server/static-data.ts';
import { createMockProxy, loadFixtures, type Fixture } from '../mock-proxy/mock.ts';
import { PROFILE_PATH } from './fixtures.ts';

const oce = findRegion('oce') as Region;

beforeEach(() => {
	clearStaticNames();
});
const me = { gameName: 'NinjaGoldfinch', tagLine: 'OCENZ' };

async function withMock(fixtures: Fixture[]) {
	const server = createMockProxy(fixtures);
	await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
	const { port } = server.address() as AddressInfo;
	return { server, client: createProxyClient(`http://127.0.0.1:${port}`, undefined) };
}

describe('loadProfile', () => {
	let mock: Awaited<ReturnType<typeof withMock>>;
	beforeAll(async () => {
		mock = await withMock(loadFixtures());
	});
	afterAll(() => {
		mock.server.close();
	});

	it('loads the recorded profile, matches and patch', async () => {
		const profile = await loadProfile(oce, me, mock.client);

		expect(profile.region).toEqual({ slug: 'oce', label: 'Oceania' });
		expect(profile.riotId).toEqual(me);
		expect(profile.summoner).toEqual({ profileIconId: 7173, summonerLevel: 458 });
		expect(profile.ranks?.[0]).toMatchObject({ tier: 'EMERALD', rank: 'III', leaguePoints: 67 });
		expect(profile.ageSeconds).toBe(213);
		expect(profile.refreshAvailableIn).toBe(0);
		expect(profile.matches).toHaveLength(10);
		expect(profile.hasMore).toBe(true);
		expect(profile.patch).toBe('16.20.1');
	});

	it('asks riot-proxy to re-read both parts on refresh, and reports the cooldown', async () => {
		const profile = await loadProfile(oce, me, mock.client, { refresh: true });
		expect(profile.refreshAvailableIn).toBe(60);
		expect(profile.matches).toHaveLength(10);
	});

	it('loads a later page and a single queue', async () => {
		const page2 = await loadProfile(oce, me, mock.client, { filter: { queue: null, page: 2 } });
		expect(page2.matches[0].matchId).toBe('OC1_712213427');
		expect(page2.filter).toEqual({ queue: null, page: 2 });

		const solo = await loadProfile(oce, me, mock.client, { filter: { queue: 420, page: 1 } });
		expect(solo.matches.every((m) => m.queueId === 420)).toBe(true);
		expect(solo.queueOptions[0]).toEqual({ id: 420, name: 'Ranked Solo' });
	});

	it('maps an unknown player to 404', async () => {
		vi.spyOn(console, 'error').mockImplementation(() => {});
		const missing = { gameName: 'NoSuchPlayer000', tagLine: 'XXXX' };
		await expect(loadProfile(oce, missing, mock.client)).rejects.toSatisfy((e) =>
			isHttpError(e, 404)
		);
	});
});

describe('loadProfile with a part riot-proxy could not fetch', () => {
	it('shows rank as unknown instead of failing the page', async () => {
		vi.spyOn(console, 'error').mockImplementation(() => {});
		const fixtures = loadFixtures().map((f) => {
			if (f.request.path !== PROFILE_PATH) return f;
			const body = { ...(f.response.body as object), league: null, warnings: ['league'] };
			return { ...f, response: { ...f.response, body } };
		});
		const mock = await withMock(fixtures);
		try {
			const profile = await loadProfile(oce, me, mock.client);
			expect(profile.ranks).toBeNull();
			expect(profile.summoner).not.toBeNull();
		} finally {
			mock.server.close();
		}
	});
});
