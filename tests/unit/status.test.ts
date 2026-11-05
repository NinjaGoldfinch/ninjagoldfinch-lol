import { afterEach, describe, expect, it, vi } from 'vitest';
import { Metrics } from '#lib/server/metrics.ts';
import { createProxyClient } from '#lib/server/proxy.ts';
import {
	overallStatus,
	probeProxy,
	riotProxyCheck,
	runChecks,
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

describe('runChecks', () => {
	it('returns the riot_proxy result, for the events (ADR-063)', async () => {
		vi.spyOn(console, 'error').mockImplementation(() => {});
		const client = (fetch: (r: Request) => Promise<Response>) =>
			createProxyClient(BASE, 'placeholder-key', fetch);
		expect(
			await runChecks(
				client(async () => Response.json(READY)),
				() => AT
			)
		).toMatchObject({
			name: 'riot_proxy',
			status: 'ok',
			checked_at: '2026-11-05T10:00:00Z'
		});
		expect(
			await runChecks(client(() => Promise.reject(new TypeError('fetch failed'))))
		).toMatchObject({ name: 'riot_proxy', status: 'down', detail: 'unreachable' });
		vi.restoreAllMocks();
	});
});

describe('startChecks', () => {
	afterEach(() => {
		vi.useRealTimers();
		vi.restoreAllMocks();
	});
	// startChecks runs once per process, so each test loads the module afresh.
	const fresh = async () => {
		vi.resetModules();
		vi.useFakeTimers();
		return await import('#lib/server/status.ts');
	};
	/** A riot-proxy that answers /readyz with each status in turn, then 200. */
	const proxy = (...statuses: number[]) => {
		let calls = 0;
		const client = createProxyClient(BASE, 'placeholder-key', async () => {
			const status = statuses[calls++] ?? 200;
			return Response.json({ ...READY, ok: status === 200 }, { status });
		});
		return { client, calls: () => calls };
	};

	it('gives the callback each riot_proxy result: at once, then every interval', async () => {
		vi.spyOn(console, 'error').mockImplementation(() => {});
		const { startChecks } = await fresh();
		const { client } = proxy(200, 503, 502);
		const seen: Check[] = [];
		startChecks(client, 30, (check) => {
			seen.push(check);
		});
		await vi.advanceTimersByTimeAsync(0);
		expect(seen.map((c) => [c.name, c.status])).toEqual([['riot_proxy', 'ok']]);
		await vi.advanceTimersByTimeAsync(29_000);
		expect(seen).toHaveLength(1);
		await vi.advanceTimersByTimeAsync(1_000);
		await vi.advanceTimersByTimeAsync(30_000);
		expect(seen.map((c) => [c.status, c.detail])).toEqual([
			['ok', 'ready'],
			['down', 'not ready'],
			['down', 'answered 502']
		]);
	});

	it('waits for the callback: the next check does not start while it runs', async () => {
		const { startChecks } = await fresh();
		const { client, calls } = proxy();
		let release: () => void = () => {};
		let entered = 0;
		startChecks(client, 30, async () => {
			entered += 1;
			if (entered === 1) await new Promise<void>((r) => (release = r));
		});
		await vi.advanceTimersByTimeAsync(60_000);
		expect([calls(), entered]).toEqual([1, 1]);
		release();
		await vi.advanceTimersByTimeAsync(30_000);
		expect([calls(), entered]).toEqual([2, 2]);
	});

	it.each([
		[
			'throws',
			() => {
				throw new Error('callback broke');
			}
		],
		['rejects', () => Promise.reject(new Error('callback broke'))]
	])('keeps checking when the callback %s, and logs it', async (_how, broken) => {
		const error = vi.spyOn(console, 'error').mockImplementation(() => {});
		const { startChecks, statusDocument } = await fresh();
		const { client, calls } = proxy();
		let entered = 0;
		startChecks(client, 30, () => {
			entered += 1;
			return broken();
		});
		await vi.advanceTimersByTimeAsync(0);
		expect(error).toHaveBeenCalledWith('status checks failed:', expect.any(Error));
		await vi.advanceTimersByTimeAsync(30_000);
		await vi.advanceTimersByTimeAsync(30_000);
		expect([calls(), entered]).toEqual([3, 3]);
		expect(error).toHaveBeenCalledTimes(3);
		// The results are still held for /api/status.
		expect(statusDocument().checks.find((c) => c.name === 'riot_proxy')).toMatchObject({
			status: 'ok',
			detail: 'ready'
		});
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
