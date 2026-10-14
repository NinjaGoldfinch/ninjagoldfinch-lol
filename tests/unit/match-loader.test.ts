import { isHttpError } from '@sveltejs/kit';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { parseStatShards } from '#lib/api/cdragon.ts';
import { findRegion, type Region } from '#lib/domain/regions.ts';
import { loadMatch } from '#lib/server/match.ts';
import { createProxyClient } from '#lib/server/proxy.ts';
import { clearStaticNames } from '#lib/server/static-data.ts';
import { loadFixtures } from '../mock-proxy/mock.ts';
import { MATCH_PATH, TIMELINE_PATH, fixtureBody } from './fixtures.ts';

const oce = findRegion('oce') as Region;
// CommunityDragon's stat shards, from the recorded (trimmed) perks.json.
const cdragon = async () =>
	parseStatShards(fixtureBody('/16.20/plugins/rcp-be-lol-game-data/global/default/v1/perks.json'));
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
});

describe('loadMatch', () => {
	it('loads the recorded match and timeline, with icons for its patch', async () => {
		const { proxy, asked } = client();
		const match = await loadMatch(oce, 'OC1_712351051', { client: proxy, cdragon });

		expect(asked).toContain(MATCH_PATH);
		expect(asked).toContain(TIMELINE_PATH);
		expect(match.queue).toBe('Ranked Solo');
		expect(match.ddragonVersion).toBe('16.20.1');
		expect(match.teams).toHaveLength(2);
		expect(match.gold).toHaveLength(34);
		expect(match.builds).toHaveLength(10);
		expect(match.builds[7].timeline?.visits[0].at).toBe(15);
		expect(match.builds[7].runes.shards.map((s) => s?.name)).toEqual([
			'Attack Speed',
			'Adaptive Force',
			'Health Scaling'
		]);
	});

	it('still loads without CommunityDragon, leaving the shards out', async () => {
		vi.spyOn(console, 'error').mockImplementation(() => {});
		const { proxy } = client();
		const match = await loadMatch(oce, 'OC1_712351051', {
			client: proxy,
			cdragon: async () => {
				throw new Error('down');
			}
		});
		expect(match.builds[7].runes.shards).toEqual([null, null, null]);
		expect(match.builds[7].runes.primary.path?.name).toBe('Sorcery');
	});

	it("does not ask riot-proxy for a match id from another region's platform", async () => {
		const { proxy, asked } = client();
		const euw = findRegion('euw') as Region;
		await expect(loadMatch(euw, 'OC1_712351051', { client: proxy, cdragon })).rejects.toSatisfy(
			(e) => isHttpError(e, 404)
		);
		await expect(loadMatch(oce, 'not-a-match', { client: proxy, cdragon })).rejects.toSatisfy((e) =>
			isHttpError(e, 404)
		);
		expect(asked).toEqual([]);
	});

	it('maps an unknown match to 404', async () => {
		vi.spyOn(console, 'error').mockImplementation(() => {});
		const { proxy } = client();
		await expect(loadMatch(oce, 'OC1_100000', { client: proxy, cdragon })).rejects.toSatisfy((e) =>
			isHttpError(e, 404)
		);
	});

	it('does not show a custom game (Riot policy)', async () => {
		const raw = fixtureBody(MATCH_PATH) as { info: object };
		const custom = { ...raw, info: { ...raw.info, queueId: 0 } };
		const { proxy } = client((path) => (path === MATCH_PATH ? json(200, custom) : undefined));
		await expect(loadMatch(oce, 'OC1_712351051', { client: proxy, cdragon })).rejects.toSatisfy(
			(e) => isHttpError(e, 404)
		);
	});

	it('still returns the scoreboard when the timeline fails', async () => {
		vi.spyOn(console, 'error').mockImplementation(() => {});
		const { proxy } = client((path) =>
			path === TIMELINE_PATH
				? json(503, { error: { code: 'RATE_LIMITED', message: 'x', retryAfter: 30 } })
				: undefined
		);
		const match = await loadMatch(oce, 'OC1_712351051', { client: proxy, cdragon });
		expect(match.teams).toHaveLength(2);
		expect(match.gold).toBeNull();
		expect(match.objectives).toBeNull();
		expect(match.builds[0]).toMatchObject({ timeline: null });
	});

	it('still returns the scoreboard when the timeline call throws', async () => {
		vi.spyOn(console, 'error').mockImplementation(() => {});
		const { proxy } = client((path) => {
			if (path === TIMELINE_PATH) throw new TypeError('fetch failed');
			return undefined;
		});
		const match = await loadMatch(oce, 'OC1_712351051', { client: proxy, cdragon });
		expect(match.teams).toHaveLength(2);
		expect(match.gold).toBeNull();
	});

	it('fails the page on a match payload it cannot read', async () => {
		const error = vi.spyOn(console, 'error').mockImplementation(() => {});
		const { proxy } = client((path) =>
			path === MATCH_PATH ? json(200, { metadata: {}, info: {} }) : undefined
		);
		await expect(loadMatch(oce, 'OC1_712351051', { client: proxy, cdragon })).rejects.toSatisfy(
			(e) => isHttpError(e, 503)
		);
		expect(error).toHaveBeenCalledWith('match OC1_712351051: unexpected payload');
	});

	it('falls back to plain names when the Data Dragon lookups fail', async () => {
		vi.spyOn(console, 'error').mockImplementation(() => {});
		const { proxy } = client((path) =>
			path.startsWith('/v1/static/champion') ? json(502, {}) : undefined
		);
		const match = await loadMatch(oce, 'OC1_712351051', { client: proxy, cdragon });
		expect(match.teams[1].players[3].champion).toMatchObject({ key: null, name: 'Kaisa' });
		expect(match.queue).toBe('Queue 420');
	});
});
