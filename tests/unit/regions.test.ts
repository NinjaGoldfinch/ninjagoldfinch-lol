import { describe, expect, it } from 'vitest';
import { REGIONS, findRegion, regionForMatchId, regionForPlatform } from '#lib/domain/regions.ts';

describe('REGIONS', () => {
	it('has unique lower-case slugs and unique platforms', () => {
		const slugs = REGIONS.map((r) => r.slug);
		expect(new Set(slugs).size).toBe(slugs.length);
		expect(slugs.every((s) => /^[a-z]+$/.test(s))).toBe(true);
		expect(new Set(REGIONS.map((r) => r.platform)).size).toBe(REGIONS.length);
	});

	it('maps every platform to a regional route the proxy documents', () => {
		for (const r of REGIONS) {
			expect(['americas', 'europe', 'asia', 'sea']).toContain(r.route);
		}
	});
});

describe('findRegion', () => {
	it('finds a region by slug, ignoring case', () => {
		expect(findRegion('kr')).toMatchObject({ platform: 'kr', route: 'asia' });
		expect(findRegion('EUW')?.platform).toBe('euw1');
	});

	it('returns undefined for an unknown slug', () => {
		expect(findRegion('mars')).toBeUndefined();
		expect(findRegion('')).toBeUndefined();
	});
});

describe('regionForPlatform', () => {
	it("finds the region for riot-proxy's platform value, in any case", () => {
		expect(regionForPlatform('oc1')?.slug).toBe('oce');
		expect(regionForPlatform('KR')?.slug).toBe('kr');
		expect(regionForPlatform('xx1')).toBeUndefined();
	});
});

describe('regionForMatchId', () => {
	it("reads the region from the match id's prefix", () => {
		expect(regionForMatchId('OC1_712351051')?.slug).toBe('oce');
		expect(regionForMatchId('EUW1_7000000000')?.slug).toBe('euw');
		expect(regionForMatchId('KR_1')?.slug).toBe('kr');
	});

	it('finds none for an unknown prefix or a malformed id', () => {
		expect(regionForMatchId('XX1_1')).toBeUndefined();
		expect(regionForMatchId('OC1')).toBeUndefined();
		expect(regionForMatchId('../OC1_1')).toBeUndefined();
	});
});
