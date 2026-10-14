import createClient, { type ClientOptions, type Middleware } from 'openapi-fetch';
import { PROXY_KEY, PROXY_URL } from '$app/env/private';
import type { paths } from '#lib/api/schema.d.ts';

/**
 * Logs every failed proxy call with riot-proxy's X-Request-Id, so a page
 * error can be traced in riot-proxy's logs.
 */
export const logFailures: Middleware = {
	onResponse({ request, response }) {
		if (response.ok) return;
		const requestId = response.headers.get('x-request-id') ?? 'none';
		console.error(
			`proxy ${response.status} ${request.method} ${new URL(request.url).pathname} request-id=${requestId}`
		);
	},
	onError({ request, error }) {
		console.error(`proxy unreachable ${request.method} ${new URL(request.url).pathname}:`, error);
	}
};

/** An analytics call slower than this is logged. riot-proxy answers from memory in about 1 ms. */
export const SLOW_ANALYTICS_MS = 250;

const started = new Map<string, number>();

/**
 * Logs a slow analytics call with riot-proxy's X-Cache (`HIT` from memory,
 * `MISS` read from its tables), so a cold slice can be told from a slow
 * network. Server log only; the header never reaches the browser.
 */
export const logSlowAnalytics: Middleware = {
	onRequest({ id, request }) {
		if (new URL(request.url).pathname.startsWith('/v1/lol/analytics/')) {
			started.set(id, performance.now());
		}
	},
	onResponse({ id, request, response }) {
		const start = started.get(id);
		if (start === undefined) return;
		started.delete(id);
		const ms = Math.round(performance.now() - start);
		if (ms <= SLOW_ANALYTICS_MS) return;
		const cache = response.headers.get('x-cache') ?? 'none';
		console.warn(
			`proxy slow ${request.method} ${new URL(request.url).pathname} x-cache=${cache} ${ms}ms`
		);
	},
	onError({ id }) {
		started.delete(id);
	}
};

/** The Authorization header is sent only when a key is configured. */
export function createProxyClient(
	baseUrl: string,
	key: string | undefined,
	fetch?: ClientOptions['fetch']
) {
	const client = createClient<paths>({
		baseUrl,
		fetch,
		headers: key ? { Authorization: `Bearer ${key}` } : {}
	});
	client.use(logFailures, logSlowAnalytics);
	return client;
}

/** The one riot-proxy client. Server only. */
export const proxy = createProxyClient(PROXY_URL, PROXY_KEY);
