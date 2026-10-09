import {
	parseAccount,
	parseLeagueEntries,
	parseSummoner,
	type LeagueEntry,
	type Summoner
} from '#lib/api/riot.ts';
import { FILTER_QUEUES, MATCHES_PER_PAGE, type MatchFilter } from '#lib/domain/match-filters.ts';
import { toMatchRows, type MatchRow } from '#lib/domain/matches.ts';
import type { Region } from '#lib/domain/regions.ts';
import type { RiotId } from '#lib/domain/riot-id.ts';
import { toHttpError } from './errors.ts';
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
	matches: MatchRow[];
	hasMore: boolean;
	filter: MatchFilter;
	/** The queue filter's choices, named for this patch. */
	queueOptions: { id: number; name: string }[];
	/** Data Dragon patch for icons. */
	patch: string;
}

/**
 * One profile call by Riot ID, then the first page of matches and the patch.
 * Two round trips: the match page needs the puuid from the profile.
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

	const [matches, patch] = await Promise.all([
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
	if (!matches.response.ok || !matches.data) toHttpError(matches.response, matches.error);

	const names = await staticNames(patch, client);
	const account = parseAccount(body.account);
	if (body.warnings.length > 0 || matches.data.warnings.length > 0) {
		console.error(
			`profile ${region.slug}/${id.gameName}#${id.tagLine} warnings: ${[...body.warnings, ...matches.data.warnings].join('; ')}`
		);
	}

	return {
		region: { slug: region.slug, label: region.label },
		riotId: {
			gameName: account?.gameName ?? id.gameName,
			tagLine: account?.tagLine ?? id.tagLine
		},
		summoner: parseSummoner(body.summoner) ?? null,
		ranks: parseLeagueEntries(body.league) ?? null,
		refreshed: body.refreshed || matches.data.refreshed,
		refreshAvailableIn: Math.max(body.refreshAvailableIn, matches.data.refreshAvailableIn),
		matches: toMatchRows(matches.data.matches, names),
		hasMore: matches.data.hasMore,
		filter,
		queueOptions: FILTER_QUEUES.map((id) => ({ id, name: names.queues[id] ?? `Queue ${id}` })),
		patch
	};
}
