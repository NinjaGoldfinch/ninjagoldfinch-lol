import { redirect } from '@sveltejs/kit';
import { frontQuery, pickRegion } from '#lib/domain/front-page.ts';
import { cacheControl } from '#lib/server/cache.ts';
import { loadFrontPage } from '#lib/server/front-page.ts';
import type { PageServerLoad } from './$types';

// Rendered per request, not prerendered, so that `handle` adds the security
// headers and the CSP goes out as a header (ADR-055). The cards are live data
// (ADR-066): a minute at the edge, and not kept there with a card missing.
export const load: PageServerLoad = async ({ url, untrack, setHeaders }) => {
	const region = pickRegion(url.searchParams);

	// One URL per region, for links and the edge cache: `/` for Oceania,
	// `/?region=kr` otherwise; anything else is tidied (ADR-071).
	const query = untrack(() => frontQuery(region));
	if (untrack(() => url.search) !== query) redirect(307, url.pathname + query);

	const page = await loadFrontPage(region);
	setHeaders(cacheControl(page.complete ? 'live' : 'none'));
	return page;
};
