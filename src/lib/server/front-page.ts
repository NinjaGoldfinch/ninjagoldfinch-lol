import type { StaticNames } from '#lib/api/ddragon.ts';
import { championNames } from '#lib/domain/champion-search.ts';
import { proxyQuery, toChampionTable, type ChampionRow } from '#lib/domain/champion-stats.ts';
import {
	FRONT_FILTER,
	fetchedAge,
	parseRotation,
	parseStatus,
	rotationChampions,
	topWinRates,
	type PlatformStatus,
	type RotationChampion
} from '#lib/domain/front-page.ts';
import { patchOf } from '#lib/domain/matches.ts';
import type { Region } from '#lib/domain/regions.ts';
import { optional } from './errors.ts';
import { currentPatch } from './patch.ts';
import { frontClient, proxy, type ProxyClient } from './proxy.ts';
import { NO_NAMES, namesOrFallback } from './static-data.ts';

export interface FrontPage {
	/** The region the rotation and status cards are for. */
	region: { slug: string; label: string };
	/** The Data Dragon version for icons; null when it is unavailable. */
	patch: string | null;
	/** `16.20`, for the patch pill; null when the patch is unavailable. */
	patchLabel: string | null;
	/** Ranked games riot-proxy has analysed; null when the analytics call failed. */
	totalGames: number | null;
	/** The top-win-rate card's rows; null when the analytics call failed. */
	topWinRates: ChampionRow[] | null;
	/** The region's free champions; null when the call failed or its payload was unreadable. */
	rotation: RotationChampion[] | null;
	/** The region's open incidents and maintenances; null likewise. */
	status: PlatformStatus | null;
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
 * The front page's cards for a region (ADR-066, ADR-067). Every call is
 * optional and they all start together: a card whose call fails, or does not
 * answer within the front page's deadline (`cards`), shows a notice instead,
 * and the page is still served. The patch and its lookups come from `client`,
 * normally held in memory.
 */
export async function loadFrontPage(
	region: Region,
	{ client = proxy, cards = frontClient }: { client?: ProxyClient; cards?: ProxyClient } = {}
): Promise<FrontPage> {
	const platform = { params: { path: { platform: region.platform } } };
	const lookups: Promise<Lookups> = currentPatch(client)
		.then(async (patch) => ({ patch, ...(await namesOrFallback(patch, client)) }))
		.catch((e: unknown) => {
			console.error('front page: patch unavailable:', e);
			return { patch: null, names: NO_NAMES, fellBack: true };
		});

	const [analytics, rotations, platformStatus, { patch, names, fellBack }] = await Promise.all([
		optional(
			cards.GET('/v1/lol/analytics/champions', { params: { query: proxyQuery(FRONT_FILTER) } })
		),
		optional(cards.GET('/v1/lol/rotations/{platform}', platform)),
		optional(cards.GET('/v1/lol/status/{platform}', platform)),
		lookups
	]);

	const stats = analytics.response.ok ? analytics.data : undefined;
	if (!stats) console.error('front page: analytics unavailable:', analytics.response.status);

	const rotation = readRotation(rotations, region, fellBack ? undefined : names);
	const status = readStatus(platformStatus, region);

	return {
		region: { slug: region.slug, label: region.label },
		patch,
		patchLabel: patchOf(patch),
		totalGames: stats ? stats.totalGames : null,
		topWinRates: stats ? topWinRates(toChampionTable(stats, names)) : null,
		rotation,
		status,
		statusCheckedSeconds: status
			? fetchedAge(platformStatus.response.headers.get('x-cache-fetched-age'))
			: null,
		championNames: championNames(names.champions),
		complete:
			stats !== undefined && rotation !== null && status !== null && patch !== null && !fellBack
	};
}

type Answer = { data?: unknown; response: Response };

/** The free champions, or null when riot-proxy failed, sent something else, or they cannot be named. */
function readRotation(
	answer: Answer,
	region: Region,
	/** undefined when the lookups fell back: no champion can be named. */
	names: StaticNames | undefined
): RotationChampion[] | null {
	if (!answer.response.ok) {
		console.error(
			`front page: rotations unavailable for ${region.platform}:`,
			answer.response.status
		);
		return null;
	}
	const rotation = parseRotation(answer.data);
	if (!rotation) {
		console.error(`front page: unexpected rotations payload for ${region.platform}`);
		return null;
	}
	if (!names) return null;
	const unknown = rotation.free.filter((id) => !names.champions[id]);
	if (unknown.length > 0) {
		console.error(`front page: free champions without lookups: ${unknown.join(', ')}`);
	}
	return rotationChampions(rotation, names.champions);
}

/** The platform's status, or null when riot-proxy failed or sent something else. */
function readStatus(answer: Answer, region: Region): PlatformStatus | null {
	if (!answer.response.ok) {
		console.error(`front page: status unavailable for ${region.platform}:`, answer.response.status);
		return null;
	}
	const status = parseStatus(answer.data);
	if (!status) console.error(`front page: unexpected status payload for ${region.platform}`);
	return status ?? null;
}
