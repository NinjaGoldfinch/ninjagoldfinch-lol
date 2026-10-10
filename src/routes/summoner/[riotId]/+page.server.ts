import { error, redirect } from '@sveltejs/kit';
import { filterQuery, parseMatchFilter } from '#lib/domain/match-filters.ts';
import { parseRiotId } from '#lib/domain/riot-id.ts';
import { cacheControl } from '#lib/server/cache.ts';
import { loadProfile } from '#lib/server/profile.ts';
import type { Actions, PageServerLoad } from './$types';

function target(params: { riotId: string }) {
	const id = parseRiotId(params.riotId);
	if (!id) error(404, 'Not found');
	return id;
}

export const load: PageServerLoad = async ({ params, url, request, setHeaders }) => {
	const id = target(params);
	const filter = parseMatchFilter(url.searchParams);

	// The filter form submits every select, so an unused one arrives empty
	// (`?queue=420&champion=`). Redirect to the clean URL: one URL per view,
	// for links and the edge cache. Form posts (refresh) are left alone.
	const query = filterQuery(filter);
	if (request.method === 'GET' && url.search !== query) redirect(307, url.pathname + query);

	const profile = await loadProfile(id, undefined, { filter });
	// A page whose match history failed is not kept at the edge.
	setHeaders(cacheControl(profile.matches ? 'profile' : 'none'));
	return profile;
};

export const actions: Actions = {
	// Returns the refreshed profile itself, so the page shows it even when a
	// cache in front of the site still holds the previous one. ADR-012.
	refresh: async ({ params, url }) => {
		const id = target(params);
		const filter = parseMatchFilter(url.searchParams);
		return { profile: await loadProfile(id, undefined, { refresh: true, filter }) };
	}
};
