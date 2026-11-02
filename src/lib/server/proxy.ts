import { error } from '@sveltejs/kit';
import createClient, { type ClientOptions, type Middleware } from 'openapi-fetch';
import { PROXY_KEY, PROXY_URL } from '$app/env/private';
import type { paths } from '#lib/api/schema.d.ts';

/**
 * Logs every failed proxy response with riot-proxy's X-Request-Id, so a page
 * error can be traced in riot-proxy's logs. A call that got no response is
 * logged by `withTimeout`.
 */
const logFailures: Middleware = {
	onResponse({ request, response }) {
		if (response.ok) return;
		const requestId = response.headers.get('x-request-id') ?? 'none';
		console.error(
			`proxy ${response.status} ${request.method} ${new URL(request.url).pathname} request-id=${requestId}`
		);
	}
};

/**
 * Refuses a path parameter of `.` or `..`. openapi-fetch encodes `/` but not
 * dots, and the URL would then resolve to another riot-proxy route. Callers
 * check their input first (`parseRiotId`), so reaching this is a bug.
 */
export const refuseDotSegments: Middleware = {
	onRequest({ schemaPath, params }) {
		for (const [name, value] of Object.entries(params.path ?? {})) {
			if (value === '.' || value === '..' || value === '') {
				throw new Error(`proxy path parameter ${name} of ${schemaPath} is '${String(value)}'`);
			}
		}
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
 * abort. A call that gets no answer, from a deadline spent or a riot-proxy
 * that can't be reached, is logged and is unavailable (503), as for any
 * other riot-proxy outage. Only the caller's own abort passes through as it
 * was.
 *
 * The fetch races a promise that only the deadline or the caller's abort
 * settles, held by its timer. Aborting a signal alone was not enough:
 * `new Request(…, { signal })` follows it through a weak reference, so a call
 * nothing else held (a riot-proxy that accepts and never answers) could be
 * collected before the abort reached it, and the page never finished.
 */
function withTimeout(fetch?: Fetch, budget: (pathname: string) => number = proxyBudget) {
	return async (request: Request): Promise<Response> => {
		const { pathname } = new URL(request.url);
		const ms = budget(pathname);
		const controller = new AbortController();
		let timedOut = false;
		let timer: ReturnType<typeof setTimeout> | undefined;
		let forward = () => {};
		const stopped = new Promise<never>((_, reject) => {
			const stop = (reason: unknown) => {
				controller.abort(reason);
				reject(reason);
			};
			timer = setTimeout(() => {
				timedOut = true;
				stop(new DOMException(`no answer in ${ms} ms`, 'TimeoutError'));
			}, ms);
			forward = () => stop(request.signal.reason);
		});
		if (request.signal.aborted) forward();
		else request.signal.addEventListener('abort', forward, { once: true });

		try {
			const response = await Promise.race([
				(fetch ?? globalThis.fetch)(new Request(request, { signal: controller.signal })),
				stopped
			]);
			// Read the body here, so the deadline covers it too.
			const body = await Promise.race([response.arrayBuffer(), stopped]);
			return new Response(body.byteLength > 0 ? body : null, response);
		} catch (e) {
			if (request.signal.aborted && !timedOut) throw e;
			if (timedOut) console.error(`proxy timeout ${request.method} ${pathname} after ${ms} ms`);
			else console.error(`proxy unreachable ${request.method} ${pathname}:`, e);
			error(503, 'Temporarily unavailable');
		} finally {
			clearTimeout(timer);
			request.signal.removeEventListener('abort', forward);
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
	client.use(refuseDotSegments, logFailures, logSlowAnalytics);
	return client;
}

/** The one riot-proxy client. Server only. */
export const proxy = createProxyClient(PROXY_URL, PROXY_KEY);
