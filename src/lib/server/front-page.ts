import type { StaticNames } from '#lib/api/ddragon.ts';
import { championNames } from '#lib/domain/champion-search.ts';
import { proxyQuery, toChampionTable, type ChampionFilter } from '#lib/domain/champion-stats.ts';
import {
	FRONT_CARD,
	FRONT_FILTER,
	fetchedAge,
	gamesAnalysed,
	isFrontFilter,
	parseStatus,
	riotStatusUrl,
	statusView,
	topChampions,
	type FrontCard,
	type PlatformStatus,
	type StatusView,
	type TopChampions
} from '#lib/domain/front-page.ts';
import { patchOf } from '#lib/domain/matches.ts';
import type { Region } from '#lib/domain/regions.ts';
import { optional } from './errors.ts';
import { currentPatch } from './patch.ts';
import { frontClient, proxy, type ProxyClient } from './proxy.ts';
import { NO_NAMES, namesOrFallback } from './static-data.ts';

export interface FrontPage {
	/** The region the status card is for. */
	region: { slug: string; label: string };
	/** The Data Dragon version for icons; null when it is unavailable. */
	patch: string | null;
	/** `16.20`, for the patch pill; null when the patch is unavailable. */
	patchLabel: string | null;
	/**
	 * Ranked games riot-proxy has analysed, each counted once: a tenth of its
	 * `totalGames`, which counts every participant (ADR-074), over the default
	 * slice whatever the card shows; null when that analytics call failed.
	 */
	totalGames: number | null;
	/** The view the top-win-rate card shows, from the query (ADR-077). */
	card: FrontCard;
	/** The card's rows and floor; null when its analytics call failed. */
	top: TopChampions | null;
	/** The region's open incidents and maintenances, as the card shows them; null when the call failed or its payload was unreadable. */
	status: StatusView | null;
	/** Riot's own status page for the region, which the card links to. */
	statusPage: string;
	/** Seconds since riot-proxy read the status from Riot (`X-Cache-Fetched-Age`), when it said. */
	statusCheckedSeconds: number | null;
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
 * The front page's cards for a region and the card's view (ADR-066, ADR-071,
 * ADR-077). Every call is optional and they all start together: a card whose
 * call fails, or does not answer within the front page's deadline (`cards`),
 * shows a notice instead, and the page is still served. The patch and its lookups come from `client`,
 * normally held in memory.
 */
export async function loadFrontPage(
	region: Region,
	{
		card = FRONT_CARD,
		client = proxy,
		cards = frontClient,
		now = Date.now
	}: {
		/** The card's view; the default slice when absent. */
		card?: FrontCard;
		client?: ProxyClient;
		cards?: ProxyClient;
		/** The clock the status entries' ages are counted from. */
		now?: () => number;
	} = {}
): Promise<FrontPage> {
	const platform = { params: { path: { platform: region.platform } } };
	const lookups: Promise<Lookups> = currentPatch(client)
		.then(async (patch) => ({ patch, ...(await namesOrFallback(patch, client)) }))
		.catch((e: unknown) => {
			console.error('front page: patch unavailable:', e);
			return { patch: null, names: NO_NAMES, fellBack: true };
		});

	const analytics = (filter: ChampionFilter) =>
		optional(cards.GET('/v1/lol/analytics/champions', { params: { query: proxyQuery(filter) } }));
	const cardCall = analytics(card.filter);
	// The pill counts the default slice; the card's call is it unless the card is filtered.
	const pillCall = isFrontFilter(card.filter) ? cardCall : analytics(FRONT_FILTER);

	const [cardAnswer, pillAnswer, platformStatus, { patch, names, fellBack }] = await Promise.all([
		cardCall,
		pillCall,
		optional(cards.GET('/v1/lol/status/{platform}', platform)),
		lookups
	]);

	const stats = cardAnswer.response.ok ? cardAnswer.data : undefined;
	if (!stats) console.error('front page: analytics unavailable:', cardAnswer.response.status);
	const pill = pillAnswer.response.ok ? pillAnswer.data : undefined;
	if (!pill && pillCall !== cardCall) {
		console.error('front page: games analysed unavailable:', pillAnswer.response.status);
	}

	const platformData = readStatus(platformStatus, region);
	const status = platformData ? statusView(platformData, now()) : null;

	return {
		region: { slug: region.slug, label: region.label },
		patch,
		patchLabel: patchOf(patch),
		totalGames: pill ? gamesAnalysed(pill.totalGames) : null,
		card,
		top: stats ? topChampions(toChampionTable(stats, names), card.sort) : null,
		status,
		statusPage: riotStatusUrl(region.platform),
		statusCheckedSeconds: status
			? fetchedAge(platformStatus.response.headers.get('x-cache-fetched-age'))
			: null,
		championNames: championNames(names.champions),
		complete:
			stats !== undefined && pill !== undefined && status !== null && patch !== null && !fellBack
	};
}

type Answer = { data?: unknown; response: Response };

/** The platform's status, or null when riot-proxy failed or sent something else. */
function readStatus(answer: Answer, region: Region): PlatformStatus | null {
	if (!answer.response.ok) {
		console.error(`front page: status unavailable for ${region.platform}:`, answer.response.status);
		return null;
	}
	const status = parseStatus(answer.data);
	if (!status) {
		console.error(`front page: unexpected status payload for ${region.platform}`);
		return null;
	}
	// Entries kept under a generic title or a positional key (ADR-072).
	const patched = [
		...status.incidents.map((item) => ({ item, kind: 'incident' })),
		...status.maintenances.map((item) => ({ item, kind: 'maintenance' }))
	].filter(({ item }) => item.missing.length > 0);
	if (patched.length > 0) {
		const list = patched
			.map(({ item, kind }) => `${kind} ${item.key} missing ${item.missing.join(' and ')}`)
			.join(', ');
		console.error(
			`front page: status entries shown with a fallback for ${region.platform}: ${list}`
		);
	}
	return status;
}
