import { error } from '@sveltejs/kit';
import { parseMatch, parseTimeline } from '#lib/api/match.ts';
import { isMatchIdFor, toMatchDetail, type MatchDetail } from '#lib/domain/match-detail.ts';
import { isCustomGame } from '#lib/domain/matches.ts';
import type { Region } from '#lib/domain/regions.ts';
import { toHttpError } from './errors.ts';
import { ddragonVersionFor, patchVersions } from './patch.ts';
import { proxy } from './proxy.ts';
import { NO_NAMES, staticNames } from './static-data.ts';

type ProxyClient = typeof proxy;

/**
 * The match and its timeline, fetched in parallel with the patch list.
 *
 * Only the match is essential. If the timeline fails, the page still renders
 * with `gold: null`; if the Data Dragon lookups fail, plain fallbacks are used.
 * A match id that does not belong to the region, and a custom game (Riot
 * policy), are not found.
 */
export async function loadMatch(
	region: Region,
	matchId: string,
	client: ProxyClient = proxy
): Promise<MatchDetail> {
	if (!isMatchIdFor(region, matchId)) error(404, 'Not found');

	const path = { region: region.route, matchId };
	const [matchResponse, timelineResponse, versions] = await Promise.all([
		client.GET('/v1/lol/matches/{region}/{matchId}', { params: { path } }),
		client.GET('/v1/lol/matches/{region}/{matchId}/timeline', { params: { path } }),
		patchVersions(client)
	]);
	if (!matchResponse.response.ok) toHttpError(matchResponse.response, matchResponse.error);

	const match = parseMatch(matchResponse.data);
	if (!match) {
		console.error(`match ${matchId}: unexpected payload`);
		error(503, 'Temporarily unavailable');
	}
	if (isCustomGame(match)) error(404, 'Not found');

	const timeline = timelineResponse.response.ok ? parseTimeline(timelineResponse.data) : undefined;
	if (timelineResponse.response.ok && !timeline) {
		console.error(`match ${matchId}: unexpected timeline payload`);
	}

	const names = await staticNames(versions.current, client).catch((e: unknown) => {
		console.error('Data Dragon lookups unavailable; using fallbacks:', e);
		return NO_NAMES;
	});

	return toMatchDetail(match, names, {
		region,
		ddragonVersion: ddragonVersionFor(versions.versions, match.gameVersion) ?? versions.current,
		timeline
	});
}
