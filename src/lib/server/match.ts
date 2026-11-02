import { error } from '@sveltejs/kit';
import { parseMatch, parseTimeline } from '#lib/api/match.ts';
import { isMatchIdFor, toMatchDetail, type MatchDetail } from '#lib/domain/match-detail.ts';
import { isCustomGame } from '#lib/domain/matches.ts';
import type { Region } from '#lib/domain/regions.ts';
import { statShards } from './cdragon.ts';
import { optional, toHttpError } from './errors.ts';
import { ddragonVersionFor, patchVersions } from './patch.ts';
import { proxy, type ProxyClient } from './proxy.ts';
import { namesOrFallback } from './static-data.ts';

interface Sources {
	client?: ProxyClient;
	/** For CommunityDragon's stat shard names; tests pass their own. */
	cdragon?: (patch: string) => ReturnType<typeof statShards>;
}

/** A match page, and whether every optional part loaded. */
export type LoadedMatch = MatchDetail & {
	/** false when the timeline, the Data Dragon lookups or the stat shards fell back. */
	complete: boolean;
};

/**
 * The match and its timeline, fetched in parallel with the patch list.
 *
 * Only the match is essential. If the timeline fails, the page still renders
 * with `gold: null` and no item or skill order; if the Data Dragon lookups
 * fail, plain fallbacks are used; if CommunityDragon fails, no stat shards.
 * A match id that does not belong to the region, and a custom game (Riot
 * policy), are not found.
 */
export async function loadMatch(
	region: Region,
	matchId: string,
	{ client = proxy, cdragon = (patch) => statShards(patch) }: Sources = {}
): Promise<LoadedMatch> {
	if (!isMatchIdFor(region, matchId)) error(404, 'Not found');

	const path = { region: region.route, matchId };
	const [matchResponse, timelineResponse, versions] = await Promise.all([
		client.GET('/v1/lol/matches/{region}/{matchId}', { params: { path } }),
		optional(client.GET('/v1/lol/matches/{region}/{matchId}/timeline', { params: { path } })),
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

	let complete = timeline !== undefined;
	const [{ names, fellBack }, shards] = await Promise.all([
		namesOrFallback(versions.current, client),
		cdragon(versions.current).catch((e: unknown) => {
			console.error('CommunityDragon stat shards unavailable:', e);
			complete = false;
			return {};
		})
	]);
	if (fellBack) complete = false;

	const detail = toMatchDetail(match, names, {
		region,
		ddragonVersion: ddragonVersionFor(versions.versions, match.gameVersion) ?? versions.current,
		timeline,
		shards
	});
	return { ...detail, complete };
}
