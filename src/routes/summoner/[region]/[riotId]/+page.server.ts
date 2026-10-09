import { error } from '@sveltejs/kit';
import { findRegion } from '#lib/domain/regions.ts';
import { parseRiotId } from '#lib/domain/riot-id.ts';
import { cacheControl } from '#lib/server/cache.ts';
import { loadProfile } from '#lib/server/profile.ts';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params, setHeaders }) => {
	const region = findRegion(params.region);
	const id = parseRiotId(params.riotId);
	if (!region || !id) error(404, 'Not found');

	const profile = await loadProfile(region, id);
	setHeaders(cacheControl('profile'));
	return profile;
};
