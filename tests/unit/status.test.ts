import { describe, expect, it, vi } from 'vitest';
import { Metrics } from '#lib/server/metrics.ts';
import { createProxyClient } from '#lib/server/proxy.ts';
import {
	overallStatus,
	probeProxy,
	riotProxyCheck,
	staticDataCheck,
	statusDocument,
	type Check
} from '#lib/server/status.ts';

const BASE = 'http://riot-proxy.test';
const AT = Date.parse('2026-11-05T10:00:00Z');
const READY = {
	ok: true,
	sqlite: true,
	limiter: true,
	keyScope: 'x',
	sqliteReaders: 4,
	sqliteReadersFree: 4
};

const check = (status: Check['status']): Check => ({
	name: 'x',
	status,
	latency_ms: 0,
	checked_at: '2026-11-05T10:00:00Z',
	detail: ''
});

describe('overallStatus', () => {
	it('is the worst of the checks', () => {
		expect(overallStatus([])).toBe('ok');
		expect(overallStatus([check('ok'), check('ok')])).toBe('ok');
		expect(overallStatus([check('ok'), check('degraded')])).toBe('degraded');
		expect(overallStatus([check('degraded'), check('down'), check('ok')])).toBe('down');
	});
});

describe('riotProxyCheck', () => {
	const run = (probe: Parameters<typeof riotProxyCheck>[0]) => riotProxyCheck(probe, AT);

	it('is ok when /readyz answers 200', () => {
		expect(run({ answered: true, status: 200, body: READY, ms: 4.6 })).toEqual({
			name: 'riot_proxy',
			status: 'ok',
			latency_ms: 5,
			checked_at: '2026-11-05T10:00:00Z',
			detail: 'ready'
		});
	});

	it('is down when riot-proxy cannot be reached', () => {
		expect(run({ answered: false, ms: 5000 })).toMatchObject({
			status: 'down',
			detail: 'unreachable'
		});
	});

	it('is down when riot-proxy is not ready, naming what is not', () => {
		const body = { ...READY, ok: false, sqlite: false };
		expect(run({ answered: true, status: 503, body, ms: 1 })).toMatchObject({
			status: 'down',
			detail: 'not ready: sqlite'
		});
		expect(run({ answered: true, status: 503, body: 'x', ms: 1 })).toMatchObject({
			status: 'down',
			detail: 'not ready'
		});
	});

	it('is down when riot-proxy refuses the key, or answers anything else', () => {
		expect(run({ answered: true, status: 401, body: {}, ms: 1 })).toMatchObject({
			status: 'down',
			detail: 'key refused (401)'
		});
		expect(run({ answered: true, status: 502, body: {}, ms: 1 })).toMatchObject({
			status: 'down',
			detail: 'answered 502'
		});
	});
});

describe('probeProxy', () => {
	const probe = (fetch: (r: Request) => Promise<Response>) =>
		probeProxy(createProxyClient(BASE, 'placeholder-key', fetch));

	it('asks /readyz with the site key', async () => {
		const seen: Request[] = [];
		const result = await probe(async (r) => {
			seen.push(r);
			return Response.json(READY);
		});
		expect(seen[0]?.url).toBe(`${BASE}/readyz`);
		expect(seen[0]?.headers.get('authorization')).toBe('Bearer placeholder-key');
		expect(result).toMatchObject({ answered: true, status: 200, body: READY });
	});

	it('keeps a 503 body', async () => {
		const body = { ...READY, ok: false, limiter: false };
		const result = await probe(async () => Response.json(body, { status: 503 }));
		expect(riotProxyCheck(result, AT)).toMatchObject({ detail: 'not ready: limiter' });
	});

	it('reports no answer without throwing', async () => {
		vi.spyOn(console, 'error').mockImplementation(() => {});
		const result = await probe(() => Promise.reject(new TypeError('fetch failed')));
		expect(result).toMatchObject({ answered: false });
		vi.restoreAllMocks();
	});
});

describe('staticDataCheck', () => {
	it('is ok once a patch is held, degraded before', () => {
		expect(staticDataCheck({ current: '16.21.1', at: AT }, AT)).toMatchObject({
			name: 'static_data',
			status: 'ok',
			detail: 'patch 16.21.1'
		});
		expect(staticDataCheck(undefined, AT)).toMatchObject({ status: 'degraded' });
	});
});

describe('statusDocument', () => {
	const build = { version: '1.0.5', commit: 'a1b2c3d', built_at: '2026-11-05T09:00:00Z' };

	it('follows the shared contract', () => {
		const doc = statusDocument(Date.now(), [check('ok'), check('degraded')], new Metrics(), build);
		expect(Object.keys(doc).toSorted()).toEqual(
			[
				'schema',
				'service',
				'host',
				'version',
				'commit',
				'built_at',
				'started_at',
				'uptime_s',
				'status',
				'checks',
				'metrics'
			].toSorted()
		);
		expect(doc).toMatchObject({ schema: 1, service: 'ninjagoldfinch-lol', ...build });
		expect(doc.status).toBe('degraded');
		expect(doc.host).not.toBe('');
		expect(doc.started_at).toMatch(/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\dZ$/);
		expect(doc.uptime_s).toBeGreaterThanOrEqual(0);
		for (const value of Object.values(doc.metrics)) expect(typeof value).toBe('number');
		expect(doc.metrics).toHaveProperty('patch_age_s');
	});

	it('is down when any check is down', () => {
		expect(
			statusDocument(Date.now(), [check('ok'), check('down')], new Metrics(), build).status
		).toBe('down');
	});
});
