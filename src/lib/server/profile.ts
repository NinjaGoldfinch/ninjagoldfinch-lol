import {
	parseAccount,
	parseLeagueEntries,
	parseSummoner,
	type LeagueEntry,
	type Summoner
} from '#lib/api/riot.ts';
import { toMatchRows, type MatchRow } from '#lib/domain/matches.ts';
import type { Region } from '#lib/domain/regions.ts';
import type { RiotId } from '#lib/domain/riot-id.ts';
import { toHttpError } from './errors.ts';
import { currentPatch } from './patch.ts';
import { proxy } from './proxy.ts';

type ProxyClient = typeof proxy;

export const MATCHES_PER_PAGE = 10;

/** Everything the profile page renders, and nothing more: it is embedded in the HTML. */
export interface ProfileData {
	region: { slug: string; label: string };
	riotId: RiotId;
	/** null when riot-proxy could not fetch that part (see its `warnings`). */
	summoner: Summoner | null;
	ranks: LeagueEntry[] | null;
	/** Age of the stalest part, in seconds. */
	ageSeconds: number | null;
	refreshAvailableIn: number;
	matches: MatchRow[];
	hasMore: boolean;
	/** Data Dragon patch for icons. */
	patch: string;
}

/**
 * One profile call by Riot ID, then the first page of matches and the patch.
 * Two round trips: the match page needs the puuid from the profile.
 *
 * `refresh` asks riot-proxy to re-read both from Riot, spending quota; it
 * allows that once a minute per player and otherwise answers from cache.
 */
export async function loadProfile(
	region: Region,
	id: RiotId,
	client: ProxyClient = proxy,
	{ refresh = false }: { refresh?: boolean } = {}
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
				query: { platform: region.platform, count: MATCHES_PER_PAGE, ...refreshQuery }
			}
		}),
		currentPatch(client)
	]);
	if (!matches.response.ok || !matches.data) toHttpError(matches.response, matches.error);

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
		ageSeconds: stalest(Object.values(body.ageSeconds)),
		refreshAvailableIn: Math.max(body.refreshAvailableIn, matches.data.refreshAvailableIn),
		matches: toMatchRows(matches.data.matches),
		hasMore: matches.data.hasMore,
		patch
	};
}

function stalest(ages: (number | null)[]): number | null {
	const known = ages.filter((age): age is number => age !== null);
	return known.length > 0 ? Math.max(...known) : null;
}
