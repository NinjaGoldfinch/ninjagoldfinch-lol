import {
	ANALYTICS_QUEUE,
	patchOptions,
	proxyQuery,
	toChampionTable
} from '#lib/domain/champion-stats.ts';
import type { ChampionFilter, ChampionTable } from '#lib/domain/champion-stats.ts';
import { championNames } from '#lib/domain/champion-search.ts';
import { toHttpError } from './errors.ts';
import { currentPatch } from './patch.ts';
import { proxy } from './proxy.ts';
import { NO_NAMES, staticNames } from './static-data.ts';

type ProxyClient = typeof proxy;

export interface ChampionsPage {
	table: ChampionTable;
	/** Patches to offer, newest first; empty when riot-proxy's list failed. */
	patches: string[];
	/** The Data Dragon version for champion icons. */
	ddragonVersion: string;
	/** For the header search's suggestions. */
	championNames: string[];
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
	const [champions, patches, ddragonVersion] = await Promise.all([
		client.GET('/v1/lol/analytics/champions', { params: { query: proxyQuery(filter) } }),
		client.GET('/v1/lol/analytics/patches', { params: { query: { queue: ANALYTICS_QUEUE } } }),
		currentPatch(client)
	]);
	if (!champions.response.ok || !champions.data) toHttpError(champions.response, champions.error);
	if (!patches.response.ok)
		console.error('analytics patches unavailable:', patches.response.status);

	const names = await staticNames(ddragonVersion, client).catch((e: unknown) => {
		console.error('Data Dragon lookups unavailable; using fallbacks:', e);
		return NO_NAMES;
	});

	return {
		table: toChampionTable(champions.data, names),
		patches: patchOptions(patches.response.ok ? patches.data : undefined),
		ddragonVersion,
		championNames: championNames(names.champions)
	};
}
