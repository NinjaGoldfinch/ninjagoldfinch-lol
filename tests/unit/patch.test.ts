import type { AddressInfo } from 'node:net';
import { isHttpError } from '@sveltejs/kit';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import {
	PATCH_TTL_MS,
	clearPatchVersions,
	currentPatch,
	patchRefresh,
	warmPatch,
	ddragonVersionFor,
	patchVersions,
	pickPatch,
	pickVersions
} from '#lib/server/patch.ts';
import { createProxyClient } from '#lib/server/proxy.ts';
import { timeLoad } from '#lib/server/timing.ts';
import { createMockProxy, loadFixtures } from '../mock-proxy/mock.ts';

describe('pickPatch', () => {
	it('prefers the mirrored patch', () => {
		expect(pickPatch({ current: '16.20.1', versions: ['16.21.1', '16.20.1'] })).toBe('16.20.1');
	});

	it("falls back to Riot's newest before the first mirror sync", () => {
		expect(pickPatch({ current: null, versions: ['16.21.1', '16.20.1'] })).toBe('16.21.1');
	});

	it('rejects anything that is not a dotted version', () => {
		expect(pickPatch({ current: '../x', versions: [] })).toBeUndefined();
		expect(pickPatch({ current: null, versions: [] })).toBeUndefined();
		expect(pickPatch(null)).toBeUndefined();
	});
});

describe('pickVersions', () => {
	it("keeps Riot's dotted versions, newest first", () => {
		expect(
			pickVersions({ current: null, versions: ['16.21.1', 'lolpatch_7.20', '16.20.1'] })
		).toEqual(['16.21.1', '16.20.1']);
		expect(pickVersions({ current: '16.20.1' })).toEqual([]);
		expect(pickVersions(null)).toEqual([]);
	});
});

describe('ddragonVersionFor', () => {
	const versions = ['16.21.1', '16.20.2', '16.20.1', '16.2.1'];

	it("picks the newest version with the game build's major.minor", () => {
		expect(ddragonVersionFor(versions, '16.20.824.8524')).toBe('16.20.2');
		expect(ddragonVersionFor(versions, '16.2.500.1')).toBe('16.2.1');
	});

	it('gives up on a patch the list lacks, or no build', () => {
		expect(ddragonVersionFor(versions, '15.24.1.1')).toBeUndefined();
		expect(ddragonVersionFor(versions, null)).toBeUndefined();
	});
});

beforeEach(() => {
	clearPatchVersions();
});

describe('currentPatch', () => {
	const server = createMockProxy(loadFixtures());
	let baseUrl = '';

	beforeAll(async () => {
		await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
		baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
	});

	afterAll(() => {
		server.close();
	});

	it('reads the patch from the recorded /v1/static/versions', async () => {
		expect(await currentPatch(createProxyClient(baseUrl, undefined))).toBe('16.20.1');
	});

	it("also returns Riot's version list", async () => {
		const { current, versions } = await patchVersions(createProxyClient(baseUrl, undefined));
		expect(current).toBe('16.20.1');
		expect(versions.slice(0, 2)).toEqual(['16.20.1', '16.19.1']);
	});

	it('maps a proxy failure to an HTTP error', async () => {
		vi.spyOn(console, 'error').mockImplementation(() => {});
		const failing = createProxyClient(
			baseUrl,
			undefined,
			async () => new Response(null, { status: 502 })
		);
		await expect(currentPatch(failing)).rejects.toSatisfy((e) => isHttpError(e, 503));
	});
});

describe('patchVersions held in memory', () => {
	const VERSIONS = { current: '16.20.1', versions: ['16.20.1', '16.19.1'] };

	/** A client that counts its requests; `answer` decides each response. */
	function counting(answer: () => Response | Promise<Response>) {
		let requests = 0;
		const client = createProxyClient('http://proxy.test', undefined, async () => {
			requests += 1;
			return answer();
		});
		return { client, requests: () => requests };
	}
	const ok = () => Response.json(VERSIONS);
	/** Lookups that load at once, counting the patches they were asked for. */
	const prepare = () => vi.fn(async () => undefined);

	beforeEach(() => {
		clearPatchVersions();
		vi.useFakeTimers();
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	it('makes one request for two calls inside the TTL', async () => {
		const { client, requests } = counting(ok);
		expect(await currentPatch(client)).toBe('16.20.1');
		vi.advanceTimersByTime(PATCH_TTL_MS - 1);
		expect(await patchVersions(client)).toEqual(VERSIONS);
		expect(requests()).toBe(1);
	});

	it('after the TTL, still answers at once and refreshes in the background', async () => {
		const { client, requests } = counting(ok);
		await currentPatch(client, prepare());
		vi.advanceTimersByTime(PATCH_TTL_MS);

		expect(await currentPatch(client, prepare())).toBe('16.20.1');
		await patchRefresh();
		expect(requests()).toBe(2);
		// The refresh restarted the TTL.
		await currentPatch(client, prepare());
		expect(patchRefresh()).toBeUndefined();
		expect(requests()).toBe(2);
	});

	it('does not charge a background refresh to the request that started it', async () => {
		const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
		const { client } = counting(ok);
		await currentPatch(client, prepare());
		vi.advanceTimersByTime(PATCH_TTL_MS);

		await timeLoad('/champions', false, () => currentPatch(client, prepare()), -1);
		await patchRefresh();
		expect(warn).toHaveBeenCalledWith(
			expect.stringMatching(/^slow load \/champions \d+ms: no riot-proxy calls$/)
		);
	});

	it('sends one refresh for callers that find the patch stale at the same time', async () => {
		const { client, requests } = counting(ok);
		await currentPatch(client, prepare());
		vi.advanceTimersByTime(PATCH_TTL_MS);

		await Promise.all([currentPatch(client), currentPatch(client), patchVersions(client)]);
		await patchRefresh();
		expect(requests()).toBe(2);
	});

	it('keeps the held patch when a refresh fails, and tries again on the next request', async () => {
		const log = vi.spyOn(console, 'error').mockImplementation(() => {});
		let fail = false;
		const { client, requests } = counting(() =>
			fail ? new Response(null, { status: 502 }) : ok()
		);
		await currentPatch(client, prepare());
		vi.advanceTimersByTime(PATCH_TTL_MS);
		fail = true;

		expect(await currentPatch(client, prepare())).toBe('16.20.1');
		await patchRefresh();
		expect(log).toHaveBeenCalledWith('patch refresh failed; keeping 16.20.1:', expect.anything());
		fail = false;
		expect(await currentPatch(client, prepare())).toBe('16.20.1');
		await patchRefresh();
		expect(requests()).toBe(3);
	});

	it('moves to a new patch only once its lookups have loaded', async () => {
		let answer = VERSIONS;
		const { client } = counting(() => Response.json(answer));
		let loaded: () => void = () => {};
		const slow = vi.fn(
			(patch: string) =>
				new Promise<void>((resolve) => {
					loaded = resolve;
					void patch;
				})
		);
		await currentPatch(client, slow);
		expect(slow).not.toHaveBeenCalled();

		vi.advanceTimersByTime(PATCH_TTL_MS);
		answer = { current: '16.21.1', versions: ['16.21.1', '16.20.1'] };
		expect(await currentPatch(client, slow)).toBe('16.20.1');
		await vi.waitFor(() => expect(slow).toHaveBeenCalledWith('16.21.1', client));
		// Still loading: pages keep the old patch.
		expect(await currentPatch(client, slow)).toBe('16.20.1');

		loaded();
		await patchRefresh();
		expect(await patchVersions(client, slow)).toEqual(answer);
	});

	it("keeps the old patch when the new patch's lookups fail", async () => {
		vi.spyOn(console, 'error').mockImplementation(() => {});
		let answer = VERSIONS;
		const { client } = counting(() => Response.json(answer));
		await currentPatch(client, prepare());
		vi.advanceTimersByTime(PATCH_TTL_MS);
		answer = { current: '16.21.1', versions: ['16.21.1', '16.20.1'] };

		await currentPatch(client, async () => {
			throw new Error('lookups unavailable');
		});
		await patchRefresh();
		expect(await currentPatch(client, prepare())).toBe('16.20.1');
		// The next request tries again, and this time the lookups load.
		await patchRefresh();
		expect(await currentPatch(client, prepare())).toBe('16.21.1');
	});

	it('does not keep a failed fetch', async () => {
		vi.spyOn(console, 'error').mockImplementation(() => {});
		let fail = true;
		const { client, requests } = counting(() =>
			fail ? new Response(null, { status: 502 }) : ok()
		);
		await expect(currentPatch(client)).rejects.toSatisfy((e) => isHttpError(e, 503));
		fail = false;
		expect(await currentPatch(client)).toBe('16.20.1');
		expect(requests()).toBe(2);
	});

	it('shares one request between concurrent first calls', async () => {
		const { client, requests } = counting(ok);
		const answers = await Promise.all([
			currentPatch(client),
			patchVersions(client),
			currentPatch(client)
		]);
		expect(answers[0]).toBe('16.20.1');
		expect(requests()).toBe(1);
	});
});

describe('warmPatch', () => {
	beforeEach(() => {
		clearPatchVersions();
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	it('loads the current patch and its lookups at start-up', async () => {
		const client = createProxyClient('http://proxy.test', undefined, async () =>
			Response.json({ current: '16.20.1', versions: ['16.20.1'] })
		);
		const prepare = vi.fn(async () => undefined);
		await warmPatch(client, prepare);

		expect(prepare).toHaveBeenCalledWith('16.20.1', client);
		expect(await currentPatch(client, prepare)).toBe('16.20.1');
	});

	it('logs a failure and does not throw: the first page tries again', async () => {
		const log = vi.spyOn(console, 'error').mockImplementation(() => {});
		const client = createProxyClient('http://proxy.test', undefined, async () => {
			throw new TypeError('fetch failed');
		});
		await expect(warmPatch(client, vi.fn())).resolves.toBeUndefined();

		expect(log).toHaveBeenCalledWith(
			'start-up warm of the current patch failed:',
			expect.anything()
		);
	});
});
