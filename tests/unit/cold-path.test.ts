import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { clearStatShards } from '#lib/server/cdragon.ts';
import { loadChampions } from '#lib/server/champions.ts';
import { loadMatch } from '#lib/server/match.ts';
import { clearPatchVersions } from '#lib/server/patch.ts';
import { loadProfile } from '#lib/server/profile.ts';
import { createProxyClient } from '#lib/server/proxy.ts';
import { clearStaticNames } from '#lib/server/static-data.ts';
import { findRegion } from '#lib/domain/regions.ts';
import { findFixture, loadFixtures } from '../mock-proxy/mock.ts';

// SPD-08: the patch and its lookups don't depend on the page's main call, so
// they start before it answers, not after.

const fixtures = loadFixtures();
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * A client answering from fixtures, `slow` paths after 30 ms and `failing`
 * ones with a 503; records each call's start and end in order.
 */
function recordingClient(
	slow: (path: string) => boolean,
	failing: (path: string) => boolean = () => false
) {
	const events: string[] = [];
	const client = createProxyClient('http://proxy.test', undefined, async (request) => {
		const url = new URL(request.url);
		const path = url.pathname + url.search;
		events.push(`start ${url.pathname}`);
		if (slow(url.pathname)) await sleep(30);
		const fixture = findFixture(fixtures, 'GET', path);
		events.push(`end ${url.pathname}`);
		return new Response(JSON.stringify(fixture?.response.body ?? {}), {
			status: failing(url.pathname) ? 503 : (fixture?.response.status ?? 500),
			headers: { 'content-type': 'application/json' }
		});
	});
	return { client, events };
}

/** Whether `first` happened before `then` in the recorded events. */
function before(events: string[], first: string, then: string): boolean {
	const a = events.findIndex((e) => e.startsWith(first));
	const b = events.findIndex((e) => e.startsWith(then));
	expect(a, first).toBeGreaterThanOrEqual(0);
	expect(b, then).toBeGreaterThanOrEqual(0);
	return a < b;
}

beforeEach(() => {
	clearPatchVersions();
	clearStaticNames();
	clearStatShards();
});

afterEach(() => {
	vi.restoreAllMocks();
});

describe('cold path', () => {
	it('a profile asks for the patch and its lookups before the profile answers', async () => {
		const { client, events } = recordingClient((p) => p.endsWith('/profile'));
		const profile = await loadProfile({ gameName: 'NinjaGoldfinch', tagLine: 'OCENZ' }, client);

		expect(profile.matches?.length).toBeGreaterThan(0);
		expect(before(events, 'start /v1/static/versions', 'end /v1/players/by-riot-id/')).toBe(true);
		expect(before(events, 'start /v1/static/champion', 'end /v1/players/by-riot-id/')).toBe(true);
		// The match page still waits for the profile: it needs the puuid.
		expect(before(events, 'end /v1/players/by-riot-id/', 'start /v1/players/fixture-puuid')).toBe(
			true
		);
	});

	it('a failed profile leaves no unhandled rejection from the lookups it started', async () => {
		vi.spyOn(console, 'error').mockImplementation(() => {});
		const unhandled = vi.fn();
		process.on('unhandledRejection', unhandled);
		// The profile 404s first; the patch call fails after it, unawaited.
		const { client } = recordingClient(
			(p) => p.startsWith('/v1/static/'),
			(p) => p.startsWith('/v1/static/')
		);
		await expect(
			loadProfile({ gameName: 'NoSuchPlayer000', tagLine: 'XXXX' }, client)
		).rejects.toMatchObject({ status: 404 });
		await sleep(60);
		process.off('unhandledRejection', unhandled);

		expect(unhandled).not.toHaveBeenCalled();
	});

	it('a match asks for the lookups and stat shards before the match answers', async () => {
		const { client, events } = recordingClient((p) => p.startsWith('/v1/lol/matches/'));
		const shards = vi.fn(async () => {
			events.push('start cdragon');
			return {};
		});
		const region = findRegion('oce');
		if (!region) throw new Error('no oce region');
		const match = await loadMatch(region, 'OC1_712351051', { client, cdragon: shards });

		expect(match.complete).toBe(true);
		expect(before(events, 'start /v1/static/champion', 'end /v1/lol/matches/')).toBe(true);
		expect(before(events, 'start cdragon', 'end /v1/lol/matches/')).toBe(true);
	});

	it('the champions table asks for the lookups before the table answers', async () => {
		const { client, events } = recordingClient((p) => p === '/v1/lol/analytics/champions');
		const page = await loadChampions({ role: null, patch: 'all', rank: null }, { client });

		expect(page.complete).toBe(true);
		expect(before(events, 'start /v1/static/champion', 'end /v1/lol/analytics/champions')).toBe(
			true
		);
	});
});
