import { describe, expect, it } from 'vitest';
import {
	LATENCY_WINDOW_MS,
	LatencyWindow,
	Metrics,
	countProxyCalls,
	countRequest,
	isProxyError
} from '#lib/server/metrics.ts';
import { createProxyClient } from '#lib/server/proxy.ts';

const BASE = 'http://riot-proxy.test';

describe('LatencyWindow', () => {
	it('reports 0 with no calls', () => {
		expect(new LatencyWindow().percentiles()).toEqual({ p50: 0, p95: 0 });
	});

	it('takes p50 and p95 by nearest rank', () => {
		const window = new LatencyWindow();
		for (let ms = 1; ms <= 100; ms++) window.record(ms, 1_000);
		expect(window.percentiles(1_000)).toEqual({ p50: 50, p95: 95 });
	});

	it('looks back five minutes only', () => {
		const window = new LatencyWindow();
		window.record(900, 0);
		window.record(10, LATENCY_WINDOW_MS);
		expect(window.percentiles(LATENCY_WINDOW_MS)).toEqual({ p50: 10, p95: 900 });
		expect(window.percentiles(LATENCY_WINDOW_MS + 1)).toEqual({ p50: 10, p95: 10 });
	});

	it('keeps only the newest calls once full', () => {
		const window = new LatencyWindow(LATENCY_WINDOW_MS, 4);
		for (const ms of [1000, 1000, 1000, 1000, 5, 5, 5, 5]) window.record(ms, 0);
		expect(window.percentiles(0)).toEqual({ p50: 5, p95: 5 });
	});
});

describe('countRequest', () => {
	it('counts every request, 5xx as errors, and /api/ routes apart', () => {
		const m = new Metrics();
		countRequest('/champions', 200, m);
		countRequest('/summoner/x-OCE', 404, m);
		countRequest('/match/OC1_1', 503, m);
		countRequest('/api/version', 200, m);
		countRequest('/apiary', 200, m);
		expect(m.snapshot()).toMatchObject({
			http_requests_total: 5,
			http_errors_total: 1,
			api_requests_total: 1
		});
	});
});

describe('isProxyError', () => {
	it('is no answer, a 429 or a 5xx, not a 4xx answer', () => {
		expect(isProxyError(undefined)).toBe(true);
		expect(isProxyError(429)).toBe(true);
		expect(isProxyError(502)).toBe(true);
		expect(isProxyError(200)).toBe(false);
		expect(isProxyError(404)).toBe(false);
	});
});

describe('countProxyCalls', () => {
	it('counts the calls, their errors and their times', async () => {
		const m = new Metrics();
		const statuses = [200, 404, 503];
		const client = createProxyClient(BASE, undefined, async () => {
			return new Response('{}', { status: statuses.shift() ?? 200 });
		});
		client.use(countProxyCalls(m));
		for (let i = 0; i < 3; i++) await client.GET('/healthz');

		const snapshot = m.snapshot();
		expect(snapshot).toMatchObject({ proxy_requests_total: 3, proxy_errors_total: 1 });
		expect(snapshot.proxy_latency_ms_p95).toBeGreaterThanOrEqual(0);
	});

	it('counts a call that got no answer as an error', async () => {
		const m = new Metrics();
		const client = createProxyClient(BASE, undefined, () =>
			Promise.reject(new TypeError('fetch failed'))
		);
		client.use(countProxyCalls(m));
		const quiet = console.error;
		console.error = () => {};
		try {
			await expect(client.GET('/healthz')).rejects.toMatchObject({ status: 503 });
		} finally {
			console.error = quiet;
		}
		expect(m.snapshot()).toMatchObject({ proxy_requests_total: 1, proxy_errors_total: 1 });
	});

	it('reports numbers only, with unit-suffixed snake_case names', () => {
		for (const [name, value] of Object.entries(new Metrics().snapshot())) {
			expect(name).toMatch(/^[a-z0-9_]+_(total|ms_p50|ms_p95)$/);
			expect(typeof value).toBe('number');
		}
	});
});
