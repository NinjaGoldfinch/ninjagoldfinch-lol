import { error } from '@sveltejs/kit';
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

/**
 * How long a call may take, body included. riot-proxy answers analytics and
 * static data from its own tables. Player and match routes may wait on Riot:
 * its client allows 25 s a request, so a refresh can take tens of seconds.
 */
export function proxyBudget(pathname: string): number {
	return pathname.startsWith('/v1/lol/analytics/') || pathname.startsWith('/v1/static/')
		? 5_000
		: 30_000;
}

type Fetch = NonNullable<ClientOptions['fetch']>;

/**
 * Sends each request with a deadline from `budget`, keeping the caller's own
 * abort. A call past its deadline is unavailable (503), as for any other
 * riot-proxy outage.
 */
export function withTimeout(fetch?: Fetch, budget: (pathname: string) => number = proxyBudget) {
	return async (request: Request): Promise<Response> => {
		const timeout = AbortSignal.timeout(budget(new URL(request.url).pathname));
		const signal = AbortSignal.any([request.signal, timeout]);
		try {
			const response = await (fetch ?? globalThis.fetch)(new Request(request, { signal }));
			// Read the body here, so the deadline covers it too.
			const body = await response.arrayBuffer();
			return new Response(body.byteLength > 0 ? body : null, response);
		} catch (e) {
			if (timeout.aborted) error(503, 'Temporarily unavailable');
			throw e;
		}
	};
}

/** The Authorization header is sent only when a key is configured. */
export function createProxyClient(
	baseUrl: string,
	key: string | undefined,
	fetch?: Fetch,
	budget?: (pathname: string) => number
) {
	const client = createClient<paths>({
		baseUrl,
		fetch: withTimeout(fetch, budget),
		headers: key ? { Authorization: `Bearer ${key}` } : {}
	});
	client.use(logFailures, logSlowAnalytics);
	return client;
}

/** The one riot-proxy client. Server only. */
export const proxy = createProxyClient(PROXY_URL, PROXY_KEY);
