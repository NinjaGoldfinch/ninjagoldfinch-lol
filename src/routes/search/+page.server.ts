import { redirect } from '@sveltejs/kit';
import { DEFAULT_REGION, findRegion } from '#lib/domain/regions.ts';
import { parseRiotIdInput, profilePath } from '#lib/domain/riot-id.ts';
import { cacheControl } from '#lib/server/cache.ts';
import type { PageServerLoad } from './$types';

// The header search form submits here with GET. A valid Riot ID redirects to
// its profile; anything else re-renders the form with a hint.
export const load: PageServerLoad = ({ url, setHeaders }) => {
	setHeaders(cacheControl('none'));

	const regionSlug = url.searchParams.get('region') ?? DEFAULT_REGION;
	const riotId = url.searchParams.get('riotId') ?? '';
	const region = findRegion(regionSlug);
	const id = parseRiotIdInput(riotId);

	if (region && id) redirect(303, profilePath(region.slug, id));

	return { region: region?.slug ?? DEFAULT_REGION, riotId };
};
