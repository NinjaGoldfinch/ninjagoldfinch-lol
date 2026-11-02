import { beforeEach, describe, expect, it, vi } from 'vitest';
import { parseStatShards } from '#lib/api/cdragon.ts';
import { CDRAGON_BUDGET_MS, clearStatShards, statShards } from '#lib/server/cdragon.ts';
import { fixtureBody } from './fixtures.ts';

const PERKS = '/16.20/plugins/rcp-be-lol-game-data/global/default/v1/perks.json';

describe('parseStatShards', () => {
	it('keeps the recorded stat shards, with lower-case icon paths', () => {
		const shards = parseStatShards(fixtureBody(PERKS));
		expect(Object.keys(shards)).toHaveLength(10);
		expect(shards[5008]).toEqual({
			name: 'Adaptive Force',
			icon: 'perk-images/statmods/statmodsadaptiveforceicon.png'
		});
	});

	it('leaves out other perks and anything malformed', () => {
		expect(
			parseStatShards([
				{ id: 8005, name: 'Press the Attack', iconPath: '/lol-game-data/assets/v1/x.png' },
				{ id: 5005, name: 'Attack Speed', iconPath: 'elsewhere.png' },
				{ id: 5008, name: 7 },
				null
			])
		).toEqual({});
		expect(parseStatShards({})).toEqual({});
	});
});

describe('statShards', () => {
	beforeEach(() => {
		clearStatShards();
	});

	const ok = () =>
		vi.fn(async () => new Response(JSON.stringify(fixtureBody(PERKS)), { status: 200 }));

	it("fetches the patch's perks.json from the base URL, once per patch", async () => {
		const fetcher = ok();
		const shards = await statShards('16.20.1', fetcher, 'http://mirror');
		await statShards('16.20.1', fetcher, 'http://mirror');

		expect(shards[5001].name).toBe('Health Scaling');
		expect(fetcher).toHaveBeenCalledTimes(1);
		expect(fetcher).toHaveBeenCalledWith(`http://mirror${PERKS}`, expect.anything());
	});

	it('gives up on a CommunityDragon that never answers, and tries again next time', async () => {
		vi.useFakeTimers();
		const hang = vi.fn(
			(_: string | URL | Request, init?: RequestInit) =>
				new Promise<Response>((_, reject) => {
					init?.signal?.addEventListener('abort', () => reject(init.signal?.reason));
				})
		);
		const call = statShards('16.20.1', hang, 'http://mirror').catch((e: unknown) => e);
		await vi.advanceTimersByTimeAsync(CDRAGON_BUDGET_MS);
		const failure = await call;
		vi.useRealTimers();

		expect(String(failure)).toContain('no answer in 5000 ms');
		const fetcher = ok();
		await statShards('16.20.1', fetcher, 'http://mirror');
		expect(fetcher).toHaveBeenCalledTimes(1);
	});

	it('does not keep a failure', async () => {
		const failing = vi.fn(async () => new Response(null, { status: 502 }));
		await expect(statShards('16.20.1', failing, 'http://mirror')).rejects.toThrow('502');

		const fetcher = ok();
		await statShards('16.20.1', fetcher, 'http://mirror');
		expect(fetcher).toHaveBeenCalledTimes(1);
	});
});
