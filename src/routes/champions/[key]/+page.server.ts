import { redirect } from '@sveltejs/kit';
import { championPath, championSlug } from '#lib/domain/champion-search.ts';
import { championQuery, parseChampionFilter } from '#lib/domain/champion-stats.ts';
import { cacheControl } from '#lib/server/cache.ts';
import { findChampionPage, loadChampionPage } from '#lib/server/champion-page.ts';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params, url, untrack, setHeaders }) => {
	const filter = parseChampionFilter(url.searchParams);
	const found = await findChampionPage(params.key);

	// One URL per view: Data Dragon's id lower-cased (`/champions/monkeyking`,
	// also reached as `/champions/wukong`), with defaults and unknown values
	// dropped. `build` picks a tab in the page, so it is kept and not tracked.
	const build = untrack(() => url.searchParams.get('build'));
	const query = championQuery(filter);
	const canonical = `${query}${build ? `${query ? '&' : '?'}build=${encodeURIComponent(build)}` : ''}`;
	if (params.key !== championSlug(found.champion) || untrack(() => url.search) !== canonical) {
		redirect(308, championPath(found.champion) + canonical);
	}

	const page = await loadChampionPage(found, filter);
	setHeaders(cacheControl('analytics'));
	return { filter, ...page };
};
