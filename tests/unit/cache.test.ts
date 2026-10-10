import { describe, expect, it } from 'vitest';
import { cacheControl, responseCachePolicy } from '#lib/server/cache.ts';

describe('cacheControl', () => {
	it('lets the edge cache profiles for 60 s, stale for 5 min', () => {
		expect(cacheControl('profile')).toEqual({
			'cache-control': 'public, s-maxage=60, stale-while-revalidate=300'
		});
	});

	it('lets the edge cache a finished match for a day, stale for another', () => {
		expect(cacheControl('match')).toEqual({
			'cache-control': 'public, s-maxage=86400, stale-while-revalidate=86400'
		});
	});

	it('lets the edge cache champion analytics for 10 min, stale for another 10', () => {
		expect(cacheControl('analytics')).toEqual({
			'cache-control': 'public, s-maxage=600, stale-while-revalidate=600'
		});
	});

	it('marks per-request responses as not cacheable', () => {
		expect(cacheControl('none')).toEqual({ 'cache-control': 'no-store' });
	});
});

describe('responseCachePolicy', () => {
	it('never caches form posts', () => {
		expect(responseCachePolicy('POST', 200)).toBe('none');
	});

	it('caches not-found briefly and other errors not at all', () => {
		expect(responseCachePolicy('GET', 404)).toBe('notFound');
		expect(responseCachePolicy('GET', 429)).toBe('none');
		expect(responseCachePolicy('GET', 503)).toBe('none');
		expect(cacheControl('notFound')).toEqual({ 'cache-control': 'public, s-maxage=60' });
	});

	it("leaves successful GETs to the load's own policy", () => {
		expect(responseCachePolicy('GET', 200)).toBeUndefined();
		expect(responseCachePolicy('HEAD', 303)).toBeUndefined();
	});
});
