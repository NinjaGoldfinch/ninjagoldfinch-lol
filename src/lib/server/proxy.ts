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
	client.use(logFailures);
	return client;
}

/** The one riot-proxy client. Server only. */
export const proxy = createProxyClient(PROXY_URL, PROXY_KEY);
