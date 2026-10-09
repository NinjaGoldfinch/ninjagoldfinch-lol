import { isHttpError } from '@sveltejs/kit';
import { describe, expect, it } from 'vitest';
import { classifyProxyError, toHttpError } from '#lib/server/errors.ts';

// Error bodies follow riot-proxy's ErrorResponse schema.
const body = (code: string, extra: Record<string, unknown> = {}) => ({
	error: { code, message: 'raw proxy message', requestId: 'req-1', ...extra }
});
const none = new Headers();

describe('classifyProxyError', () => {
	it('maps NOT_FOUND and VALIDATION to not found', () => {
		expect(classifyProxyError(404, body('NOT_FOUND'), none)).toEqual({
			status: 404,
			body: { message: 'Not found' }
		});
		expect(classifyProxyError(400, body('VALIDATION'), none).status).toBe(404);
	});

	it('maps both rate limits to 429 with the retry time from the body', () => {
		expect(classifyProxyError(429, body('QUOTA_EXCEEDED', { retryAfter: 30 }), none)).toEqual({
			status: 429,
			body: { message: 'Too many requests', retryAfter: 30 }
		});
		expect(classifyProxyError(503, body('RATE_LIMITED', { retryAfter: 5 }), none).body).toEqual({
			message: 'Too many requests',
			retryAfter: 5
		});
	});

	it('falls back to Retry-After, and ignores one that is not whole seconds', () => {
		const headers = new Headers({ 'retry-after': '12' });
		expect(classifyProxyError(503, body('RATE_LIMITED'), headers).body.retryAfter).toBe(12);

		const date = new Headers({ 'retry-after': 'Fri, 09 Oct 2026 03:33:00 GMT' });
		expect(classifyProxyError(503, body('RATE_LIMITED'), date).body.retryAfter).toBeUndefined();
	});

	it('maps everything else to unavailable', () => {
		for (const [status, code] of [
			[502, 'UPSTREAM_ERROR'],
			[401, 'UNAUTHORIZED'],
			[403, 'FORBIDDEN'],
			[400, 'BAD_REGION'],
			[500, 'INTERNAL']
		] as const) {
			expect(classifyProxyError(status, body(code), none)).toEqual({
				status: 503,
				body: { message: 'Temporarily unavailable' }
			});
		}
		expect(classifyProxyError(500, 'not json', none).status).toBe(503);
	});

	it('never passes the raw proxy message through', () => {
		const result = classifyProxyError(404, body('NOT_FOUND'), none);
		expect(JSON.stringify(result)).not.toContain('raw proxy message');
	});
});

describe('toHttpError', () => {
	it('throws a SvelteKit HttpError with the mapped status and body', () => {
		const response = new Response(null, { status: 404 });
		try {
			toHttpError(response, body('NOT_FOUND'));
			expect.unreachable();
		} catch (thrown) {
			expect(isHttpError(thrown, 404)).toBe(true);
			expect(isHttpError(thrown) && thrown.body.message).toBe('Not found');
		}
	});
});
