import { redirect } from '@sveltejs/kit';
import { parseVsPick, withPick } from '#lib/domain/champion-page.ts';
import { championPath, championSlug } from '#lib/domain/champion-search.ts';
import { championQuery, parseChampionFilter } from '#lib/domain/champion-stats.ts';
import { cacheControl } from '#lib/server/cache.ts';
import { findChampionPage, loadChampionPage } from '#lib/server/champion-page.ts';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params, url, untrack, setHeaders }) => {
	const filter = parseChampionFilter(url.searchParams);
	const found = await findChampionPage(params.key);

	const vs = parseVsPick(url.searchParams, found.champions, filter.role);

	// One URL per view: Data Dragon's id lower-cased (`/champions/monkeyking`,
	// also reached as `/champions/wukong`), with defaults and unknown values
	// dropped. `build` picks a tab in the page, so it is kept and not tracked.
	const build = untrack(() => url.searchParams.get('build'));
	const query = withPick(championQuery(filter), vs);
	const canonical = `${query}${build ? `${query ? '&' : '?'}build=${encodeURIComponent(build)}` : ''}`;
	// The name for good (308); the query only for now (307), since a default
	// or a champion the lookups don't know yet can change.
	if (params.key !== championSlug(found.champion)) {
		redirect(308, championPath(found.champion) + canonical);
	}
	if (untrack(() => url.search) !== canonical) redirect(307, url.pathname + canonical);

	const page = await loadChampionPage(found, filter, { vs });
	// A page with a part missing is not kept at the edge.
	setHeaders(cacheControl(page.complete ? 'analytics' : 'none'));
	return { filter, ...page };
};
