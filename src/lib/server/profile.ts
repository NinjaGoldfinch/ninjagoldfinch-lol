import { error } from '@sveltejs/kit';
import { toLeagueEntries, toSummoner, type LeagueEntry, type Summoner } from '#lib/api/riot.ts';
import {
	FILTER_QUEUES,
	MATCHES_PER_PAGE,
	NO_FILTER,
	type MatchFilter
} from '#lib/domain/match-filters.ts';
import { isCustomGame, toMatchRows, type MatchRow } from '#lib/domain/matches.ts';
import { regionForPlatform } from '#lib/domain/regions.ts';
import type { RiotId } from '#lib/domain/riot-id.ts';
import { classifyProxyError, toHttpError } from './errors.ts';
import { currentPatch } from './patch.ts';
import { proxy } from './proxy.ts';
import { NO_NAMES, staticNames } from './static-data.ts';

type ProxyClient = typeof proxy;

/** Everything the profile page renders, and nothing more: it is embedded in the HTML. */
export interface ProfileData {
	region: { slug: string; label: string };
	riotId: RiotId;
	/** null when riot-proxy could not fetch that part (see its `warnings`). */
	summoner: Summoner | null;
	ranks: LeagueEntry[] | null;
	/**
	 * Seconds since riot-proxy last read what the page shows (summoner, rank,
	 * match list) from Riot: the oldest of those. null if none is known. The
	 * account and mastery parts are left out; riot-proxy re-reads Riot IDs
	 * rarely and the page does not show mastery. ADR-019.
	 */
	fetchedAgeSeconds: number | null;
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
	/** The champion filter's choices: every champion in this patch, by name. */
	championOptions: { id: number; name: string }[];
	/**
	 * For a champion-filtered page: whether riot-proxy's archive holds the
	 * player's whole history yet. false means older games are still arriving.
	 * null when not filtered by champion.
	 */
	archiveComplete: boolean | null;
	/** Data Dragon patch for icons. */
	patch: string;
}

/**
 * One profile call by Riot ID, then the page of matches and the patch.
 * Two round trips: the match page needs the puuid from the profile.
 *
 * The profile is asked for without a platform: riot-proxy finds the one the
 * player plays on from their account and names it, and the match page is
 * asked for on that platform (ADR-037). A platform the site has no region for
 * is unavailable, not guessed.
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
	id: RiotId,
	client: ProxyClient = proxy,
	{ refresh = false, filter = NO_FILTER }: { refresh?: boolean; filter?: MatchFilter } = {}
): Promise<ProfileData> {
	const refreshQuery = refresh ? { refresh: true } : {};
	const profile = await client.GET('/v1/players/by-riot-id/{gameName}/{tagLine}/profile', {
		params: { path: id, query: refreshQuery }
	});
	if (!profile.response.ok || !profile.data) toHttpError(profile.response, profile.error);
	const body = profile.data;
	const region = body.platform ? regionForPlatform(body.platform) : undefined;
	if (!region) {
		console.error(`profile ${id.gameName}#${id.tagLine}: unknown platform ${body.platform}`);
		error(503, 'Temporarily unavailable');
	}

	const [page, patch] = await Promise.all([
		client.GET('/v1/players/{puuid}/matches', {
			params: {
				path: { puuid: body.puuid },
				query: {
					platform: region.platform,
					...(filter.page > 1 ? { start: (filter.page - 1) * MATCHES_PER_PAGE } : {}),
					count: MATCHES_PER_PAGE,
					...(filter.queue !== null ? { queue: filter.queue } : {}),
					...(filter.champion !== null ? { champion: filter.champion } : {}),
					...refreshQuery
				}
			}
		}),
		currentPatch(client)
	]);

	const names = await staticNames(patch, client).catch((e: unknown) => {
		console.error('Data Dragon lookups unavailable; using fallbacks:', e);
		return NO_NAMES;
	});

	const label = `${region.slug}/${id.gameName}#${id.tagLine}`;
	const matches = page.response.ok && page.data ? page.data : null;
	const warnings = [...body.warnings, ...(matches?.warnings ?? [])];
	if (warnings.length > 0) console.error(`profile ${label} warnings: ${warnings.join('; ')}`);

	const account = body.account;
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
		summoner: toSummoner(body.summoner),
		ranks: toLeagueEntries(body.league),
		fetchedAgeSeconds: oldest([
			body.fetchedAgeSeconds.summoner,
			body.fetchedAgeSeconds.league,
			matches?.matchIdsFetchedAgeSeconds ?? null
		]),
		refreshAvailableIn: Math.max(body.refreshAvailableIn, matches?.refreshAvailableIn ?? 0),
		matches: shown ? toMatchRows(shown, names) : null,
		matchesError,
		customHidden: Boolean(matches && shown && shown.length < matches.matches.length),
		hasMore: matches?.hasMore ?? false,
		filter,
		queueOptions: FILTER_QUEUES.map((id) => ({ id, name: names.queues[id] ?? `Queue ${id}` })),
		championOptions: Object.entries(names.champions)
			.map(([id, c]) => ({ id: Number(id), name: c.name }))
			.sort((a, b) => a.name.localeCompare(b.name)),
		archiveComplete: matches?.archive?.complete ?? null,
		patch
	};
}

function oldest(ages: (number | null)[]): number | null {
	const known = ages.filter((age): age is number => age !== null);
	return known.length > 0 ? Math.max(...known) : null;
}
