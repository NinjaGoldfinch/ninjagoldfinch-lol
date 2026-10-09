import { error } from '@sveltejs/kit';
import { findRegion } from '#lib/domain/regions.ts';
import { parseRiotId } from '#lib/domain/riot-id.ts';
import { cacheControl } from '#lib/server/cache.ts';
import { loadProfile } from '#lib/server/profile.ts';
import type { Actions, PageServerLoad } from './$types';

function target(params: { region: string; riotId: string }) {
	const region = findRegion(params.region);
	const id = parseRiotId(params.riotId);
	if (!region || !id) error(404, 'Not found');
	return { region, id };
}

export const load: PageServerLoad = async ({ params, setHeaders }) => {
	const { region, id } = target(params);
	const profile = await loadProfile(region, id);
	setHeaders(cacheControl('profile'));
	return profile;
};

export const actions: Actions = {
	// Returns the refreshed profile itself, so the page shows it even when a
	// cache in front of the site still holds the previous one.
	refresh: async ({ params }) => {
		const { region, id } = target(params);
		return { profile: await loadProfile(region, id, undefined, { refresh: true }) };
	}
};
