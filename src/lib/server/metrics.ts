import type { Middleware } from 'openapi-fetch';

// In-memory counters for GET /api/status (ADR-062). Counters only go up from
// the process start; the status bot works out rates. Nothing here is sent
// anywhere: the status endpoint reads it.

/** How far back the riot-proxy latency percentiles look. */
export const LATENCY_WINDOW_MS = 5 * 60 * 1000;

/**
 * The last calls' times, kept in a ring of fixed size, so a busy minute can't
 * grow it. Percentiles cover only the calls within `windowMs`.
 */
export class LatencyWindow {
	private readonly at: number[];
	private readonly ms: number[];
	private next = 0;
	private size = 0;

	constructor(
		private readonly windowMs: number = LATENCY_WINDOW_MS,
		private readonly capacity: number = 4096
	) {
		this.at = new Array<number>(capacity).fill(0);
		this.ms = new Array<number>(capacity).fill(0);
	}

	record(ms: number, now: number = Date.now()): void {
		this.at[this.next] = now;
		this.ms[this.next] = ms;
		this.next = (this.next + 1) % this.capacity;
		this.size = Math.min(this.size + 1, this.capacity);
	}

	/** p50 and p95 by nearest rank, in whole ms; 0 with no calls in the window. */
	percentiles(now: number = Date.now()): { p50: number; p95: number } {
		const recent: number[] = [];
		for (let i = 0; i < this.size; i++) {
			const at = this.at[i] ?? 0;
			if (now - at <= this.windowMs) recent.push(this.ms[i] ?? 0);
		}
		if (recent.length === 0) return { p50: 0, p95: 0 };
		recent.sort((a, b) => a - b);
		const rank = (p: number) => recent[Math.max(0, Math.ceil(p * recent.length) - 1)] ?? 0;
		return { p50: Math.round(rank(0.5)), p95: Math.round(rank(0.95)) };
	}
}

export const COUNTERS = [
	'http_requests_total',
	'http_errors_total',
	'api_requests_total',
	'proxy_requests_total',
	'proxy_errors_total'
] as const;

export type Counter = (typeof COUNTERS)[number];

export class Metrics {
	private readonly counters = new Map<Counter, number>(COUNTERS.map((c) => [c, 0]));
	readonly proxyLatency = new LatencyWindow();

	count(name: Counter, by = 1): void {
		this.counters.set(name, (this.counters.get(name) ?? 0) + by);
	}

	/** The counters and the latency percentiles, flat, as `/api/status` reports them. */
	snapshot(now: number = Date.now()): Record<string, number> {
		const { p50, p95 } = this.proxyLatency.percentiles(now);
		return {
			...Object.fromEntries(this.counters),
			proxy_latency_ms_p50: p50,
			proxy_latency_ms_p95: p95
		};
	}
}

/** This process's metrics. */
export const metrics = new Metrics();

/**
 * Counts one finished request: every one, a 5xx as an error, and the site's
 * own API routes (`/api/…`) apart.
 */
export function countRequest(pathname: string, status: number, into: Metrics = metrics): void {
	into.count('http_requests_total');
	if (status >= 500) into.count('http_errors_total');
	if (pathname === '/api' || pathname.startsWith('/api/')) into.count('api_requests_total');
}

/**
 * A riot-proxy call that failed: no answer, a 429 or a 5xx. A 404 or other 4xx
 * is an answer (an unknown player), not a fault.
 */
export function isProxyError(status: number | undefined): boolean {
	return status === undefined || status === 429 || status >= 500;
}

/**
 * Counts every riot-proxy call the site makes and records its time. Only the
 * pages' client uses it, so the status check's own calls are not counted.
 */
export function countProxyCalls(into: Metrics = metrics): Middleware {
	const started = new Map<string, number>();
	const finish = (id: string, status: number | undefined) => {
		const start = started.get(id);
		started.delete(id);
		into.count('proxy_requests_total');
		if (isProxyError(status)) into.count('proxy_errors_total');
		if (start !== undefined) into.proxyLatency.record(performance.now() - start);
	};
	return {
		onRequest({ id }) {
			started.set(id, performance.now());
		},
		onResponse({ id, response }) {
			finish(id, response.status);
		},
		onError({ id }) {
			finish(id, undefined);
		}
	};
}
