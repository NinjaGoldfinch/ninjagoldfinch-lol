import {
	ANALYTICS_QUEUE,
	patchOptions,
	proxyQuery,
	toChampionTable
} from '#lib/domain/champion-stats.ts';
import type { ChampionFilter, ChampionTable } from '#lib/domain/champion-stats.ts';
import { championNames } from '#lib/domain/champion-search.ts';
import { optional, toHttpError } from './errors.ts';
import { currentPatch } from './patch.ts';
import { proxy, type ProxyClient } from './proxy.ts';
import { namesOrFallback } from './static-data.ts';

export interface ChampionsPage {
	table: ChampionTable;
	/** Patches to offer, newest first; empty when riot-proxy's list failed. */
	patches: string[];
	/** The Data Dragon version for champion icons. */
	ddragonVersion: string;
	/** For the header search's suggestions. */
	championNames: string[];
	/** false when the patch list or the Data Dragon lookups fell back. */
	complete: boolean;
}

/**
 * The champion table for a role and patch: riot-proxy's rows summed over
 * every tier, with the patch list and the current patch's names alongside.
 *
 * Only the table is essential. Without the patch list the picker offers the
 * default only; without the Data Dragon lookups, riot-proxy's names are used.
 */
export async function loadChampions(
	filter: ChampionFilter,
	{ client = proxy }: { client?: ProxyClient } = {}
): Promise<ChampionsPage> {
	// The patch's lookups start as soon as the patch is known, alongside the
	// table rather than after it (SPD-08).
	const [champions, patches, { ddragonVersion, names, fellBack }] = await Promise.all([
		client.GET('/v1/lol/analytics/champions', { params: { query: proxyQuery(filter) } }),
		optional(
			client.GET('/v1/lol/analytics/patches', { params: { query: { queue: ANALYTICS_QUEUE } } })
		),
		currentPatch(client).then(async (ddragonVersion) => ({
			ddragonVersion,
			...(await namesOrFallback(ddragonVersion, client))
		}))
	]);
	if (!champions.response.ok || !champions.data) toHttpError(champions.response, champions.error);
	if (!patches.response.ok)
		console.error('analytics patches unavailable:', patches.response.status);

	const complete = patches.response.ok && !fellBack;

	return {
		table: toChampionTable(champions.data, names),
		patches: patchOptions(patches.response.ok ? patches.data : undefined),
		ddragonVersion,
		championNames: championNames(names.champions),
		complete
	};
}
