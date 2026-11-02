import { redirect } from '@sveltejs/kit';
import { championQuery, parseChampionFilter, parseSort } from '#lib/domain/champion-stats.ts';
import { cacheControl } from '#lib/server/cache.ts';
import { loadChampions } from '#lib/server/champions.ts';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ url, untrack, setHeaders }) => {
	const filter = parseChampionFilter(url.searchParams);

	// One URL per view, for links and the edge cache: the filter form submits
	// every field, so defaults and unknown values are dropped. The sort is
	// read without tracking, so changing it reruns nothing: the page sorts.
	const query = untrack(() => championQuery(filter, parseSort(url.searchParams.get('sort'))));
	if (untrack(() => url.search) !== query) redirect(307, url.pathname + query);

	const page = await loadChampions(filter);
	// A page with a part missing is not kept at the edge.
	setHeaders(cacheControl(page.complete ? 'analytics' : 'none'));
	return { filter, ...page };
};
