import {
	parseAccount,
	parseLeagueEntries,
	parseSummoner,
	type LeagueEntry,
	type Summoner
} from '#lib/api/riot.ts';
import type { StaticNames } from '#lib/api/ddragon.ts';
import { FILTER_QUEUES, MATCHES_PER_PAGE, type MatchFilter } from '#lib/domain/match-filters.ts';
import { isCustomGame, toMatchRows, type MatchRow } from '#lib/domain/matches.ts';
import type { Region } from '#lib/domain/regions.ts';
import type { RiotId } from '#lib/domain/riot-id.ts';
import { classifyProxyError, toHttpError } from './errors.ts';
import { currentPatch } from './patch.ts';
import { proxy } from './proxy.ts';
import { staticNames } from './static-data.ts';

type ProxyClient = typeof proxy;

/** Everything the profile page renders, and nothing more: it is embedded in the HTML. */
export interface ProfileData {
	region: { slug: string; label: string };
	riotId: RiotId;
	/** null when riot-proxy could not fetch that part (see its `warnings`). */
	summoner: Summoner | null;
	ranks: LeagueEntry[] | null;
	/**
	 * Whether this load went to Riot (a refresh riot-proxy accepted). riot-proxy
	 * reports how long content has been unchanged, not when it last fetched it,
	 * so there is no honest "updated N minutes ago" otherwise. ADR-016.
	 */
	refreshed: boolean;
	refreshAvailableIn: number;
	/** null when the match page could not be loaded; `matchesError` says why. */
	matches: MatchRow[] | null;
	matchesError: { status: number; retryAfter?: number } | null;
	/** Custom games were left out of this page (Riot policy). */
	customHidden: boolean;
	hasMore: boolean;
	filter: MatchFilter;
	/** The queue filter's choices, named for this patch. */
	queueOptions: { id: number; name: string }[];
	/** Data Dragon patch for icons. */
	patch: string;
}

const NO_NAMES: StaticNames = { champions: {}, items: {}, spells: {}, queues: {}, runes: {} };

/**
 * One profile call by Riot ID, then the page of matches and the patch.
 * Two round trips: the match page needs the puuid from the profile.
 *
 * Only the profile call is essential. If the match page fails, the page still
 * renders with `matches: null`; if the Data Dragon lookups fail, plain
 * fallbacks are used.
 *
 * `refresh` asks riot-proxy to re-read both from Riot, spending quota; it
 * allows that once a minute per player and otherwise answers from cache.
 * `filter` picks the match page: a queue, and which page of ten.
 */
export async function loadProfile(
	region: Region,
	id: RiotId,
	client: ProxyClient = proxy,
	{
		refresh = false,
		filter = { queue: null, page: 1 }
	}: { refresh?: boolean; filter?: MatchFilter } = {}
): Promise<ProfileData> {
	const refreshQuery = refresh ? { refresh: true } : {};
	const profile = await client.GET('/v1/players/by-riot-id/{gameName}/{tagLine}/profile', {
		params: { path: id, query: { platform: region.platform, ...refreshQuery } }
	});
	if (!profile.response.ok || !profile.data) toHttpError(profile.response, profile.error);
	const body = profile.data;

	const [page, patch] = await Promise.all([
		client.GET('/v1/players/{puuid}/matches', {
			params: {
				path: { puuid: body.puuid },
				query: {
					platform: region.platform,
					...(filter.page > 1 ? { start: (filter.page - 1) * MATCHES_PER_PAGE } : {}),
					count: MATCHES_PER_PAGE,
					...(filter.queue !== null ? { queue: filter.queue } : {}),
					...refreshQuery
				}
			}
		}),
		currentPatch(client)
	]);

	const names = await staticNames(patch, client).catch((error: unknown) => {
		console.error('Data Dragon lookups unavailable; using fallbacks:', error);
		return NO_NAMES;
	});

	const label = `${region.slug}/${id.gameName}#${id.tagLine}`;
	const matches = page.response.ok && page.data ? page.data : null;
	const warnings = [...body.warnings, ...(matches?.warnings ?? [])];
	if (warnings.length > 0) console.error(`profile ${label} warnings: ${warnings.join('; ')}`);

	const account = parseAccount(body.account);
	const shown = matches?.matches.filter((m) => !isCustomGame(m));
	let matchesError: ProfileData['matchesError'] = null;
	if (!matches) {
		const failure = classifyProxyError(page.response.status, page.error, page.response.headers);
		matchesError = { status: failure.status, retryAfter: failure.body.retryAfter };
	}

	return {
		region: { slug: region.slug, label: region.label },
		riotId: {
			gameName: account?.gameName ?? id.gameName,
			tagLine: account?.tagLine ?? id.tagLine
		},
		summoner: parseSummoner(body.summoner) ?? null,
		ranks: parseLeagueEntries(body.league) ?? null,
		refreshed: body.refreshed || Boolean(matches?.refreshed),
		refreshAvailableIn: Math.max(body.refreshAvailableIn, matches?.refreshAvailableIn ?? 0),
		matches: shown ? toMatchRows(shown, names) : null,
		matchesError,
		customHidden: Boolean(matches && shown && shown.length < matches.matches.length),
		hasMore: matches?.hasMore ?? false,
		filter,
		queueOptions: FILTER_QUEUES.map((id) => ({ id, name: names.queues[id] ?? `Queue ${id}` })),
		patch
	};
}
