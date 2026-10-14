import { error } from '@sveltejs/kit';
import type { components } from '#lib/api/schema.d.ts';

type ErrorResponse = components['schemas']['ErrorResponse'];

/**
 * The three states a visitor can see when riot-proxy fails: not found (404),
 * rate limited (429, with seconds to wait when known) and unavailable (503).
 * Raw proxy messages are never passed through.
 */
export interface ProxyFailure {
	status: 404 | 429 | 503;
	body: Omit<App.Error, 'status'>;
}

export function classifyProxyError(status: number, body: unknown, headers: Headers): ProxyFailure {
	const code = isErrorResponse(body) ? body.error.code : undefined;

	// VALIDATION means the input (such as a malformed Riot ID) cannot name anything.
	if (status === 404 || code === 'NOT_FOUND' || code === 'VALIDATION') {
		return { status: 404, body: { message: 'Not found' } };
	}

	// QUOTA_EXCEEDED: this site's consumer quota. RATE_LIMITED: Riot's budget.
	if (status === 429 || code === 'QUOTA_EXCEEDED' || code === 'RATE_LIMITED') {
		return {
			status: 429,
			body: { message: 'Too many requests', retryAfter: retryAfter(body, headers) }
		};
	}

	return { status: 503, body: { message: 'Temporarily unavailable' } };
}

/** Throws the SvelteKit error for a failed proxy response. */
export function toHttpError(response: Response, body: unknown): never {
	const failure = classifyProxyError(response.status, body, response.headers);
	error(failure.status, failure.body);
}

/** An optional call that threw: unreachable, timed out or unreadable. */
export interface Unanswered {
	data?: undefined;
	error?: undefined;
	response: Response;
}

/**
 * For a call a page can do without: a throw becomes a 503 response for that
 * call alone, so the page's usual "not ok" branch handles it instead of
 * failing the whole page. The client has already logged an unreachable
 * riot-proxy or a timeout.
 */
export function optional<T extends { response: Response }>(
	call: Promise<T>
): Promise<T | Unanswered> {
	return call.catch(() => ({ response: new Response(null, { status: 503 }) }));
}

function isErrorResponse(body: unknown): body is ErrorResponse {
	if (typeof body !== 'object' || body === null || !('error' in body)) return false;
	const inner = body.error;
	return typeof inner === 'object' && inner !== null && 'code' in inner;
}

function retryAfter(body: unknown, headers: Headers): number | undefined {
	const fromBody = isErrorResponse(body) ? body.error.retryAfter : undefined;
	if (typeof fromBody === 'number' && fromBody >= 0) return fromBody;

	const fromHeader = Number(headers.get('retry-after'));
	return headers.has('retry-after') && Number.isInteger(fromHeader) && fromHeader >= 0
		? fromHeader
		: undefined;
}
