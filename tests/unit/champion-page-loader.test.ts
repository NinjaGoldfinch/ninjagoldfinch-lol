import { isHttpError, isRedirect } from '@sveltejs/kit';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { findChampionPage, loadChampionPage, resolveChampion } from '#lib/server/champion-page.ts';
import { createProxyClient } from '#lib/server/proxy.ts';
import type { ChampionFilter } from '#lib/domain/champion-stats.ts';
import { clearStaticNames } from '#lib/server/static-data.ts';
import { clearPatchVersions } from '#lib/server/patch.ts';
import { loadFixtures } from '../mock-proxy/mock.ts';
import { recordedNames } from './fixtures.ts';

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

const failing = (prefix: string) => (path: string) =>
	path.startsWith(prefix) ? json(503, {}) : undefined;
const BASE = '/v1/lol/analytics/champions/103';
const ALL: ChampionFilter = { role: null, patch: 'all' };

beforeEach(() => {
	clearStaticNames();
	clearPatchVersions();
	vi.restoreAllMocks();
});

describe('resolveChampion', () => {
	const { champions } = recordedNames();

	it('finds a champion by Data Dragon id or name, as the search compares them', () => {
		expect(resolveChampion(champions, 'ahri')?.championId).toBe(103);
		expect(resolveChampion(champions, 'kaisa')?.champion.name).toBe("Kai'Sa");
		expect(resolveChampion(champions, 'MasterYi')?.championId).toBe(11);
	});

	it('takes no prefixes', () => {
		expect(resolveChampion(champions, 'ahr')).toBeUndefined();
		expect(resolveChampion(champions, '')).toBeUndefined();
	});
});

describe('findChampionPage', () => {
	it('is not found for no champion', async () => {
		const { proxy } = client();
		const failure = await findChampionPage('nobody', { client: proxy }).catch((e: unknown) => e);
		expect(isHttpError(failure) && failure.status).toBe(404);
	});

	it("is unavailable without Data Dragon's names", async () => {
		vi.spyOn(console, 'error').mockImplementation(() => {});
		const { proxy } = client(failing('/v1/static/champion'));
		const failure = await findChampionPage('ahri', { client: proxy }).catch((e: unknown) => e);
		expect(isHttpError(failure) && failure.status).toBe(503);
		expect(isRedirect(failure)).toBe(false);
	});
});

describe('loadChampionPage', () => {
	async function load(override?: (path: string) => Response | undefined, filter = ALL) {
		const { proxy, asked } = client(override);
		const found = await findChampionPage('ahri', { client: proxy });
		return { page: await loadChampionPage(found, filter, { client: proxy }), asked };
	}

	it("asks for the detail, set builds, matchups and the champion's patches", async () => {
		const { page, asked } = await load();
		expect(asked).toEqual(
			expect.arrayContaining([
				`${BASE}?queue=RANKED_SOLO_5x5&patch=all&minGames=0&limit=10`,
				`${BASE}/builds?queue=RANKED_SOLO_5x5&patch=all&minGames=0`,
				`${BASE}/matchups?queue=RANKED_SOLO_5x5&patch=all&minGames=0&limit=200`,
				'/v1/lol/analytics/patches?queue=RANKED_SOLO_5x5&championId=103'
			])
		);
		expect(page.champion.name).toBe('Ahri');
		expect(page.stats?.games).toBe(2407);
		expect(page.setBuilds?.builds).toHaveLength(3);
		expect(page.patches[0]).toBe('16.20');
		expect(page.championNames).toContain('Ahri');
	});

	it("follows the set builds' role for the matchups when none is asked for", async () => {
		const { page } = await load();
		expect(page.matchupRole).toBe('MIDDLE');
		expect(page.matchups).toHaveLength(116);
	});

	it('uses the role asked for', async () => {
		const { page, asked } = await load(undefined, { role: 'mid', patch: 'all' });
		expect(asked).toContain(
			`${BASE}/builds?queue=RANKED_SOLO_5x5&patch=all&role=MIDDLE&minGames=0`
		);
		expect(page.matchupRole).toBe('MIDDLE');
	});

	it('still loads when the builds fail, with every lane of matchups', async () => {
		vi.spyOn(console, 'error').mockImplementation(() => {});
		const { page } = await load(failing(`${BASE}/builds`));
		expect(page.setBuilds).toBeNull();
		expect(page.popular.items.length).toBeGreaterThan(0);
		expect(page.matchupRole).toBeNull();
		expect(page.matchups?.some((m) => m.role !== 'MIDDLE')).toBe(true);
	});

	it('still loads when the matchups or the patch list fail', async () => {
		vi.spyOn(console, 'error').mockImplementation(() => {});
		const { page } = await load(
			(path) => failing(`${BASE}/matchups`)(path) ?? failing('/v1/lol/analytics/patches')(path)
		);
		expect(page.matchups).toBeNull();
		expect(page.patches).toEqual([]);
		expect(page.setBuilds?.builds).toHaveLength(3);
	});

	it('still loads when the builds, matchups and patch list calls throw', async () => {
		vi.spyOn(console, 'error').mockImplementation(() => {});
		const { page } = await load((path) => {
			if (path.startsWith(`${BASE}/`) || path.startsWith('/v1/lol/analytics/patches')) {
				throw new TypeError('fetch failed');
			}
			return undefined;
		});
		expect(page.stats).not.toBeNull();
		expect(page.setBuilds).toBeNull();
		expect(page.matchups).toBeNull();
		expect(page.patches).toEqual([]);
	});

	it('fails when the detail fails', async () => {
		const failure = await load((path) =>
			path.startsWith(`${BASE}?`) ? json(503, {}) : undefined
		).catch((e: unknown) => e);
		expect(isHttpError(failure) && failure.status).toBe(503);
	});
});
