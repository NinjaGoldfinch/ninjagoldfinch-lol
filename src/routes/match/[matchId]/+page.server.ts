import { error } from '@sveltejs/kit';
import { regionForMatchId } from '#lib/domain/regions.ts';
import { cacheControl } from '#lib/server/cache.ts';
import { loadMatch } from '#lib/server/match.ts';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params, setHeaders }) => {
	// The match id names its platform (`OC1_…`), so the URL needs no region.
	const region = regionForMatchId(params.matchId);
	if (!region) error(404, 'Not found');

	const match = await loadMatch(region, params.matchId);
	// A finished match never changes, but a page with a part missing (the
	// timeline, the names or the stat shards) is not kept at the edge.
	setHeaders(cacheControl(match.complete ? 'match' : 'none'));
	return match;
};
