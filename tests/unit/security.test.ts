import { describe, expect, it } from 'vitest';
import { CDRAGON_ORIGIN, DDRAGON_ORIGIN } from '#lib/assets.ts';
import { CSP_DIRECTIVES, SECURITY_HEADERS, setSecurityHeaders } from '#lib/server/security.ts';

describe('setSecurityHeaders', () => {
	it('sets every header with its exact value', () => {
		const headers = new Headers();
		setSecurityHeaders(headers);

		expect(Object.fromEntries(headers)).toEqual({
			'strict-transport-security': 'max-age=31536000',
			'x-content-type-options': 'nosniff',
			'referrer-policy': 'strict-origin-when-cross-origin',
			'x-frame-options': 'DENY',
			'cross-origin-opener-policy': 'same-origin',
			'permissions-policy':
				'accelerometer=(), camera=(), geolocation=(), gyroscope=(), magnetometer=(), microphone=(), payment=(), usb=()'
		});
	});

	it('replaces a value already set and leaves other headers alone', () => {
		const headers = new Headers({ 'x-frame-options': 'SAMEORIGIN', 'cache-control': 'no-store' });
		setSecurityHeaders(headers);

		expect(headers.get('x-frame-options')).toBe('DENY');
		expect(headers.get('cache-control')).toBe('no-store');
	});

	it('keeps HSTS to this host: no includeSubDomains or preload', () => {
		expect(SECURITY_HEADERS['strict-transport-security']).not.toMatch(/includeSubDomains|preload/);
	});
});

describe('CSP_DIRECTIVES', () => {
	it('blocks everything the site does not use', () => {
		expect(CSP_DIRECTIVES).toEqual({
			'default-src': ['self'],
			'script-src': ['self'],
			'style-src': ['self'],
			'style-src-attr': ['unsafe-inline'],
			'img-src': [
				'self',
				'data:',
				'https://ddragon.leagueoflegends.com',
				'https://raw.communitydragon.org'
			],
			'connect-src': ['self'],
			'font-src': ['self'],
			'object-src': ['none'],
			'base-uri': ['self'],
			'form-action': ['self'],
			'frame-ancestors': ['none']
		});
	});

	it('takes the image hosts from assets.ts', () => {
		expect(CSP_DIRECTIVES['img-src']).toContain(DDRAGON_ORIGIN);
		expect(CSP_DIRECTIVES['img-src']).toContain(CDRAGON_ORIGIN);
	});

	it('allows no inline or eval script, and inline styles only as attributes', () => {
		const unsafe = (sources: readonly string[]) => sources.filter((s) => s.startsWith('unsafe-'));
		expect(unsafe(CSP_DIRECTIVES['script-src'])).toEqual([]);
		expect(unsafe(CSP_DIRECTIVES['default-src'])).toEqual([]);
		expect(unsafe(CSP_DIRECTIVES['style-src'])).toEqual([]);
		expect(CSP_DIRECTIVES['style-src-attr']).toEqual(['unsafe-inline']);
	});
});
