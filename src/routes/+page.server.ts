import { cacheControl } from '#lib/server/cache.ts';
import { loadFrontPage } from '#lib/server/front-page.ts';
import type { PageServerLoad } from './$types';

// Rendered per request, not prerendered, so that `handle` adds the security
// headers and the CSP goes out as a header (ADR-055). The cards are live data
// (ADR-066): a minute at the edge, and not kept there with a card missing.
export const load: PageServerLoad = async ({ setHeaders }) => {
	const page = await loadFrontPage();
	setHeaders(cacheControl(page.complete ? 'live' : 'none'));
	return page;
};
