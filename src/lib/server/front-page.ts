import type { StaticNames } from '#lib/api/ddragon.ts';
import { championNames } from '#lib/domain/champion-search.ts';
import { proxyQuery, toChampionTable, type ChampionRow } from '#lib/domain/champion-stats.ts';
import { FRONT_FILTER, topWinRates } from '#lib/domain/front-page.ts';
import { patchOf } from '#lib/domain/matches.ts';
import { optional } from './errors.ts';
import { currentPatch } from './patch.ts';
import { frontClient, proxy, type ProxyClient } from './proxy.ts';
import { NO_NAMES, namesOrFallback } from './static-data.ts';

export interface FrontPage {
	/** The Data Dragon version for icons; null when it is unavailable. */
	patch: string | null;
	/** `16.20`, for the patch pill; null when the patch is unavailable. */
	patchLabel: string | null;
	/** Ranked games riot-proxy has analysed; null when the analytics call failed. */
	totalGames: number | null;
	/** The top-win-rate card's rows; null when the analytics call failed. */
	topWinRates: ChampionRow[] | null;
	/** For the header search's and the hero search's suggestions. */
	championNames: string[];
	/** false when a card's call failed or the lookups fell back: the page is not kept at the edge. */
	complete: boolean;
}

interface Lookups {
	patch: string | null;
	names: StaticNames;
	fellBack: boolean;
}

/**
 * The front page's cards (ADR-066). Every call is optional and they all start
 * together: a card whose call fails, or does not answer within the front
 * page's deadline (`cards`), shows a notice instead, and the page is still
 * served. The patch and its lookups come from `client`, normally held in
 * memory.
 */
export async function loadFrontPage({
	client = proxy,
	cards = frontClient
}: { client?: ProxyClient; cards?: ProxyClient } = {}): Promise<FrontPage> {
	const lookups: Promise<Lookups> = currentPatch(client)
		.then(async (patch) => ({ patch, ...(await namesOrFallback(patch, client)) }))
		.catch((e: unknown) => {
			console.error('front page: patch unavailable:', e);
			return { patch: null, names: NO_NAMES, fellBack: true };
		});

	const [analytics, { patch, names, fellBack }] = await Promise.all([
		optional(
			cards.GET('/v1/lol/analytics/champions', { params: { query: proxyQuery(FRONT_FILTER) } })
		),
		lookups
	]);

	const stats = analytics.response.ok ? analytics.data : undefined;
	if (!stats) console.error('front page: analytics unavailable:', analytics.response.status);

	return {
		patch,
		patchLabel: patchOf(patch),
		totalGames: stats ? stats.totalGames : null,
		topWinRates: stats ? topWinRates(toChampionTable(stats, names)) : null,
		championNames: championNames(names.champions),
		complete: stats !== undefined && patch !== null && !fellBack
	};
}
