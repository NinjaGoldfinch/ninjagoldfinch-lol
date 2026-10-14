import type { AddressInfo } from 'node:net';
import { isHttpError } from '@sveltejs/kit';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import {
	PATCH_TTL_MS,
	clearPatchVersions,
	currentPatch,
	ddragonVersionFor,
	patchVersions,
	pickPatch,
	pickVersions
} from '#lib/server/patch.ts';
import { createProxyClient } from '#lib/server/proxy.ts';
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

	beforeEach(() => {
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

	it('asks again once the TTL has passed', async () => {
		const { client, requests } = counting(ok);
		await currentPatch(client);
		vi.advanceTimersByTime(PATCH_TTL_MS);
		await currentPatch(client);
		expect(requests()).toBe(2);
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
