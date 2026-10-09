import { describe, expect, it } from 'vitest';
import { cacheControl } from '#lib/server/cache.ts';

describe('cacheControl', () => {
	it('lets the edge cache profiles for 60 s, stale for 5 min', () => {
		expect(cacheControl('profile')).toEqual({
			'cache-control': 'public, s-maxage=60, stale-while-revalidate=300'
		});
	});

	it('marks per-request responses as not cacheable', () => {
		expect(cacheControl('none')).toEqual({ 'cache-control': 'no-store' });
	});
});
