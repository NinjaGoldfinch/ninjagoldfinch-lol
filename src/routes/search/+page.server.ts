import { redirect } from '@sveltejs/kit';
import {
	championNames,
	championPath,
	findChampion,
	searchHint
} from '#lib/domain/champion-search.ts';
import { DEFAULT_REGION, findRegion } from '#lib/domain/regions.ts';
import { parseRiotIdInput, profilePath } from '#lib/domain/riot-id.ts';
import { cacheControl } from '#lib/server/cache.ts';
import { currentPatch } from '#lib/server/patch.ts';
import { staticNames } from '#lib/server/static-data.ts';
import type { PageServerLoad } from './$types';

// The header search form submits here with GET. A query with `#` is a Riot ID
// and redirects to its profile; anything else is a champion name and
// redirects to that champion's builds (ADR-034). Otherwise the form
// re-renders with a hint.
export const load: PageServerLoad = async ({ url, setHeaders }) => {
	setHeaders(cacheControl('none'));

	const regionSlug = url.searchParams.get('region') ?? DEFAULT_REGION;
	const region = findRegion(regionSlug)?.slug ?? DEFAULT_REGION;
	// `riotId` is the field's name before champions could be searched.
	const query = (url.searchParams.get('q') ?? url.searchParams.get('riotId') ?? '').trim();
	const page = (message: string | null, names: string[] = []) => ({
		region,
		query,
		message,
		championNames: names
	});

	if (!query) return page(null);
	if (query.includes('#')) {
		const id = parseRiotIdInput(query);
		if (id) redirect(303, profilePath(region, id));
		return page('A Riot ID is Game name#TAG.');
	}

	const names = await currentPatch()
		.then(staticNames)
		.catch((e: unknown) => {
			console.error('Data Dragon lookups unavailable for the champion search:', e);
			return null;
		});
	if (!names) return page('Champion search is unavailable right now. A Riot ID needs its #TAG.');

	const found = findChampion(names.champions, query);
	if (found.championId !== null) redirect(303, `${championPath(found.champion)}#builds`);
	return page(searchHint(query, found.matches), championNames(names.champions));
};
