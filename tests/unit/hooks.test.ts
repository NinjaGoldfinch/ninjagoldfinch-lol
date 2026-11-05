import type { RequestEvent } from '@sveltejs/kit';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { metrics } from '#lib/server/metrics.ts';
import { SECURITY_HEADERS } from '#lib/server/security.ts';
import { handle, handleError } from '../../src/hooks.server';

const event = {
	request: new Request('http://localhost/summoner/oce/x-OCE'),
	url: new URL('http://localhost/summoner/oce/x-OCE')
} as RequestEvent;

afterEach(() => {
	vi.restoreAllMocks();
});

describe('handleError', () => {
	it('logs unknown errors and shows a generic message', () => {
		const log = vi.spyOn(console, 'error').mockImplementation(() => {});
		const result = handleError({ kind: 'unknown', error: new Error('fetch failed'), event });

		expect(result).toEqual({ message: 'Temporarily unavailable' });
		expect(log).toHaveBeenCalledOnce();
	});

	it('keeps app and framework errors as they are', () => {
		const log = vi.spyOn(console, 'error').mockImplementation(() => {});

		expect(
			handleError({ kind: 'app', error: { status: 404, message: 'Not found' }, event })
		).toBeUndefined();
		expect(
			handleError({ kind: 'framework', error: { status: 404, message: 'Not Found' }, event })
		).toBeUndefined();
		expect(log).not.toHaveBeenCalled();
	});
});

describe('handle', () => {
	const run = (method: string, status: number) =>
		handle({
			event: { ...event, request: new Request('http://localhost/x', { method }) } as RequestEvent,
			resolve: async () =>
				new Response('x', { status, headers: { 'cache-control': 'public, s-maxage=60' } })
		});

	it('replaces the cache policy on errors and form posts', async () => {
		expect((await run('GET', 503)).headers.get('cache-control')).toBe('no-store');
		expect((await run('POST', 200)).headers.get('cache-control')).toBe('no-store');
	});

	it('gives a response without a policy none, such as a redirect', async () => {
		for (const status of [200, 303, 307, 308]) {
			const response = await handle({
				event: { ...event, request: new Request('http://localhost/x') } as RequestEvent,
				resolve: async () => new Response(null, { status })
			});
			expect(response.headers.get('cache-control')).toBe('no-store');
		}
	});

	it("keeps a successful GET's own policy", async () => {
		expect((await run('GET', 200)).headers.get('cache-control')).toBe('public, s-maxage=60');
	});
});

describe('handle security headers', () => {
	const expectSecurityHeaders = (response: Response) => {
		for (const [name, value] of Object.entries(SECURITY_HEADERS)) {
			expect(response.headers.get(name), name).toBe(value);
		}
	};
	const run = (url: string, response: Response) =>
		handle({
			event: { ...event, request: new Request(url), url: new URL(url) } as RequestEvent,
			resolve: async () => response
		});

	it('adds them to a page, alongside its own cache policy', async () => {
		const response = await run(
			'http://localhost/champions',
			new Response('x', { headers: { 'cache-control': 'public, s-maxage=600' } })
		);
		expectSecurityHeaders(response);
		expect(response.headers.get('cache-control')).toBe('public, s-maxage=600');
	});

	it('adds them to a redirect, which gets no-store', async () => {
		const response = await run(
			'http://localhost/champions?patch=all',
			new Response(null, { status: 307, headers: { location: '/champions' } })
		);
		expectSecurityHeaders(response);
		expect(response.headers.get('cache-control')).toBe('no-store');
	});

	it('adds them to an error, which gets no-store', async () => {
		const response = await run(
			'http://localhost/summoner/x-OCE',
			new Response('x', { status: 503, headers: { 'cache-control': 'public, s-maxage=60' } })
		);
		expectSecurityHeaders(response);
		expect(response.headers.get('cache-control')).toBe('no-store');
	});

	it('adds them to /healthz, which stays no-store', async () => {
		const response = await run(
			'http://localhost/healthz',
			Response.json({ ok: true }, { headers: { 'cache-control': 'no-store' } })
		);
		expectSecurityHeaders(response);
		expect(response.headers.get('cache-control')).toBe('no-store');
	});
});

describe('handle timing', () => {
	it('logs a slow request under its route id, not its URL (SPD-07)', async () => {
		const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
		await handle({
			event: {
				...event,
				route: { id: '/summoner/[riotId]' },
				isDataRequest: false
			} as RequestEvent,
			resolve: async () => {
				await new Promise((resolve) => setTimeout(resolve, 120));
				return new Response('x', { headers: { 'cache-control': 'public, s-maxage=60' } });
			}
		});

		expect(warn).toHaveBeenCalledWith(
			expect.stringMatching(/^slow load \/summoner\/\[riotId\] \d+ms: no riot-proxy calls$/)
		);
	});
});

describe('handle request counts', () => {
	const run = (url: string, resolve: () => Promise<Response>) =>
		handle({
			event: { ...event, request: new Request(url), url: new URL(url) } as RequestEvent,
			resolve
		});
	const counts = () => metrics.snapshot();

	it('counts every request, its 5xx, and the API routes', async () => {
		const before = counts();
		await run('http://localhost/champions', async () => new Response('x'));
		await run('http://localhost/api/version', async () => new Response('x'));
		await run('http://localhost/match/OC1_1', async () => new Response('x', { status: 503 }));
		const after = counts();

		expect(after.http_requests_total).toBe((before.http_requests_total ?? 0) + 3);
		expect(after.http_errors_total).toBe((before.http_errors_total ?? 0) + 1);
		expect(after.api_requests_total).toBe((before.api_requests_total ?? 0) + 1);
	});

	it('counts a request that threw as an error', async () => {
		const before = counts();
		await expect(
			run('http://localhost/x', () => Promise.reject(new Error('boom')))
		).rejects.toThrow('boom');
		expect(counts().http_errors_total).toBe((before.http_errors_total ?? 0) + 1);
	});
});
