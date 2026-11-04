// Security headers on every response `handle` sees, and the Content Security
// Policy SvelteKit adds to every page (vite.config.ts). ADR-055.

import type { Config } from '@sveltejs/kit/vite';
import { CDRAGON_ORIGIN, DDRAGON_ORIGIN } from '#lib/assets.ts';

/**
 * Cloudflare Web Analytics: Cloudflare adds its beacon script to every page
 * at the edge, and the beacon reports page views and Core Web Vitals
 * (ADR-056). Not part of the site's own code.
 */
export const CLOUDFLARE_INSIGHTS = {
	script: 'https://static.cloudflareinsights.com',
	report: 'https://cloudflareinsights.com'
} as const;

type CspDirectives = NonNullable<NonNullable<Config['csp']>['directives']>;

// assets.ts builds the origins with URL, so they are plain strings.
const host = (origin: string) => origin as `https://${string}.${string}`;

/**
 * Everything the site does not use is blocked. SvelteKit adds the hash of
 * each page's inline bootstrap script to `script-src` (hash mode, so a page
 * cached at the edge stays valid for every visitor), and Cloudflare's
 * analytics beacon by its origin. `style-src-attr` allows
 * inline `style` attributes: the server renders `style:` directives as
 * attributes, and the charts and damage bars position from data.
 */
export const CSP_DIRECTIVES = {
	'default-src': ['self'],
	'script-src': ['self', CLOUDFLARE_INSIGHTS.script],
	'style-src': ['self'],
	'style-src-attr': ['unsafe-inline'],
	'img-src': ['self', 'data:', host(DDRAGON_ORIGIN), host(CDRAGON_ORIGIN)],
	'connect-src': ['self', CLOUDFLARE_INSIGHTS.report],
	'font-src': ['self'],
	'object-src': ['none'],
	'base-uri': ['self'],
	'form-action': ['self'],
	'frame-ancestors': ['none']
} satisfies CspDirectives;

/**
 * HSTS covers this host only, without `includeSubDomains` or `preload`
 * (owner, 2026-11-05). TLS ends at Cloudflare, which forwards the header.
 */
export const SECURITY_HEADERS = {
	'strict-transport-security': 'max-age=31536000',
	'x-content-type-options': 'nosniff',
	'referrer-policy': 'strict-origin-when-cross-origin',
	'x-frame-options': 'DENY',
	'cross-origin-opener-policy': 'same-origin',
	'permissions-policy':
		'accelerometer=(), camera=(), geolocation=(), gyroscope=(), magnetometer=(), microphone=(), payment=(), usb=()'
} as const;

/** Sets every security header on a response's headers, replacing any already there. */
export function setSecurityHeaders(headers: Headers): void {
	for (const [name, value] of Object.entries(SECURITY_HEADERS)) headers.set(name, value);
}
