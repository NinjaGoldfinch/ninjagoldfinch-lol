import { cacheControl } from '#lib/server/cache.ts';
import type { PageServerLoad } from './$types';

// No proxy data, but rendered per request rather than prerendered so that
// `handle` adds the security headers and the CSP goes out as a header (ADR-055).
export const load: PageServerLoad = ({ setHeaders }) => {
	setHeaders(cacheControl('static'));
};
