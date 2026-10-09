import type { AddressInfo } from 'node:net';
import { isHttpError } from '@sveltejs/kit';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { findRegion, type Region } from '#lib/domain/regions.ts';
import { loadProfile } from '#lib/server/profile.ts';
import { createProxyClient } from '#lib/server/proxy.ts';
import { clearStaticNames } from '#lib/server/static-data.ts';
import { createMockProxy, loadFixtures, type Fixture } from '../mock-proxy/mock.ts';
import { MATCHES_PATH, PROFILE_PATH, fixtureBody } from './fixtures.ts';

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
		// The oldest of summoner (602 s), league (42 s) and the match ids (42 s).
		expect(profile.fetchedAgeSeconds).toBe(602);
		expect(profile.refreshAvailableIn).toBe(0);
		expect(profile.matches).toHaveLength(10);
		expect(profile.hasMore).toBe(true);
		expect(profile.patch).toBe('16.20.1');
	});

	it('asks riot-proxy to re-read both parts on refresh, and reports the cooldown', async () => {
		const profile = await loadProfile(oce, me, mock.client, { refresh: true });
		expect(profile.refreshAvailableIn).toBe(60);
		expect(profile.fetchedAgeSeconds).toBe(0);
		expect(profile.matches).toHaveLength(10);
	});

	it('loads a later page and a single queue', async () => {
		const page2 = await loadProfile(oce, me, mock.client, {
			filter: { queue: null, champion: null, page: 2 }
		});
		expect(page2.matches?.[0].matchId).toBe('OC1_712213427');
		expect(page2.filter).toEqual({ queue: null, champion: null, page: 2 });

		const solo = await loadProfile(oce, me, mock.client, {
			filter: { queue: 420, champion: null, page: 1 }
		});
		expect(solo.matches?.every((m) => m.queueId === 420)).toBe(true);
		expect(solo.queueOptions[0]).toEqual({ id: 420, name: 'Ranked Solo' });
	});

	it("loads one champion's games from riot-proxy's archive", async () => {
		const viego = await loadProfile(oce, me, mock.client, {
			filter: { queue: null, champion: 234, page: 1 }
		});
		expect(viego.matches?.every((m) => m.champion.name === 'Viego')).toBe(true);
		expect(viego.archiveComplete).toBe(true);
		expect(viego.championOptions.map((c) => c.name)).toEqual(
			[...viego.championOptions.map((c) => c.name)].sort((a, b) => a.localeCompare(b))
		);
		expect(viego.championOptions).toContainEqual({ id: 234, name: 'Viego' });

		const all = await loadProfile(oce, me, mock.client);
		expect(all.archiveComplete).toBeNull();
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

describe('loadProfile when parts fail', () => {
	/** A client answering from fixtures, with some paths overridden. */
	function client(override: (path: string) => Response | undefined) {
		const fixtures = loadFixtures();
		return createProxyClient('http://proxy.test', undefined, async (request) => {
			const url = new URL(request.url);
			const path = url.pathname + url.search;
			const custom = override(path);
			if (custom) return custom;
			const f = fixtures.find((x) => x.request.path === path);
			return new Response(JSON.stringify(f?.response.body ?? {}), {
				status: f?.response.status ?? 500,
				headers: { 'content-type': 'application/json' }
			});
		});
	}
	const json = (status: number, body: unknown, headers: Record<string, string> = {}) =>
		new Response(JSON.stringify(body), {
			status,
			headers: { 'content-type': 'application/json', ...headers }
		});

	it('still returns the profile when the match page is rate limited', async () => {
		vi.spyOn(console, 'error').mockImplementation(() => {});
		const limited = client((path) =>
			path.includes('/matches')
				? json(503, { error: { code: 'RATE_LIMITED', message: 'x', retryAfter: 30 } })
				: undefined
		);
		const profile = await loadProfile(oce, me, limited);

		expect(profile.summoner?.summonerLevel).toBe(458);
		expect(profile.matches).toBeNull();
		expect(profile.matchesError).toEqual({ status: 429, retryAfter: 30 });
		expect(profile.hasMore).toBe(false);
	});

	it('leaves custom games out and says so', async () => {
		const body = fixtureBody(MATCHES_PATH) as { matches: { queueId: number | null }[] };
		const withCustom = {
			...body,
			matches: body.matches.map((m, i) => (i < 2 ? { ...m, queueId: i === 0 ? 0 : null } : m))
		};
		const custom = client((path) => (path === MATCHES_PATH ? json(200, withCustom) : undefined));
		const profile = await loadProfile(oce, me, custom);

		expect(profile.matches).toHaveLength(8);
		expect(profile.customHidden).toBe(true);
	});

	it('says when the archive is still filling for a champion filter', async () => {
		const path = MATCHES_PATH.replace('count=10', 'count=10&champion=234');
		const body = fixtureBody(path) as object;
		const filling = client((p) =>
			p === path ? json(200, { ...body, archive: { complete: false } }) : undefined
		);
		const profile = await loadProfile(oce, me, filling, {
			filter: { queue: null, champion: 234, page: 1 }
		});
		expect(profile.archiveComplete).toBe(false);
	});

	it('falls back to plain names when the Data Dragon lookups fail', async () => {
		vi.spyOn(console, 'error').mockImplementation(() => {});
		const noStatic = client((path) =>
			path.startsWith('/v1/static/') && path !== '/v1/static/versions'
				? json(503, { error: { code: 'UPSTREAM_ERROR', message: 'x' } })
				: undefined
		);
		const profile = await loadProfile(oce, me, noStatic);

		expect(profile.matches?.[0].champion).toMatchObject({ key: null, name: 'Ahri' });
		expect(profile.matches?.[0].queue).toBe('Queue 420');
	});
});
