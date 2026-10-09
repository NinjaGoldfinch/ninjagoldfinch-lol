import { error } from '@sveltejs/kit';
import { findRegion } from '#lib/domain/regions.ts';
import { cacheControl } from '#lib/server/cache.ts';
import { loadMatch } from '#lib/server/match.ts';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params, setHeaders }) => {
	const region = findRegion(params.region);
	if (!region) error(404, 'Not found');

	const match = await loadMatch(region, params.matchId);
	// A finished match never changes, but a page whose timeline failed is not
	// kept at the edge for a day.
	setHeaders(cacheControl(match.gold ? 'match' : 'none'));
	return match;
};
