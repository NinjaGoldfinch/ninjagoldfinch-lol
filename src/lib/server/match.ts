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
 * The match and its timeline, fetched in parallel with the patch list and,
 * once the patch is known, its lookups and stat shards (SPD-08).
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
	// The patch, its lookups and stat shards don't depend on the match, so
	// they load alongside it rather than after it.
	const lookups = patchVersions(client).then(async (versions) => {
		const [names, shards] = await Promise.all([
			namesOrFallback(versions.current, client),
			cdragon(versions.current).then(
				(shards) => ({ shards, ok: true }),
				(e: unknown) => {
					console.error('CommunityDragon stat shards unavailable:', e);
					return { shards: {}, ok: false };
				}
			)
		]);
		return { versions, names, shards };
	});
	const [matchResponse, timelineResponse, { versions, names, shards }] = await Promise.all([
		client.GET('/v1/lol/matches/{region}/{matchId}', { params: { path } }),
		optional(client.GET('/v1/lol/matches/{region}/{matchId}/timeline', { params: { path } })),
		lookups
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

	const complete = timeline !== undefined && !names.fellBack && shards.ok;

	const detail = toMatchDetail(match, names.names, {
		region,
		ddragonVersion: ddragonVersionFor(versions.versions, match.gameVersion) ?? versions.current,
		timeline,
		shards: shards.shards
	});
	return { ...detail, complete };
}
