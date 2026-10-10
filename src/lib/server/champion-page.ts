import { error } from '@sveltejs/kit';
import type { Named } from '#lib/api/ddragon.ts';
import {
	toChampionStats,
	toMatchups,
	toPopularChoices,
	toSetBuilds,
	toTierRows,
	type ChampionStats,
	type Matchup,
	type PopularChoices,
	type SetBuilds,
	type TierRow
} from '#lib/domain/champion-page.ts';
import { champKey, championNames } from '#lib/domain/champion-search.ts';
import {
	ANALYTICS_QUEUE,
	ROLES,
	analyticsQuery,
	patchOptions,
	type ChampionFilter
} from '#lib/domain/champion-stats.ts';
import { toHttpError } from './errors.ts';
import { currentPatch } from './patch.ts';
import { proxy } from './proxy.ts';
import { staticNames } from './static-data.ts';

type ProxyClient = typeof proxy;

export interface ChampionPage {
	championId: number;
	champion: Named;
	/** The patch riot-proxy answered for: `all` or a `major.minor`. */
	patch: string | null;
	stats: ChampionStats | null;
	tiers: TierRow[];
	/** null when riot-proxy's builds failed. */
	setBuilds: SetBuilds | null;
	/** The detail's lists, shown when there are no set builds. */
	popular: PopularChoices;
	/** null when riot-proxy's matchups failed. */
	matchups: Matchup[] | null;
	/** The lane the matchups are for, as riot-proxy names it; null for every lane. */
	matchupRole: string | null;
	/** Patches this champion was played on, newest first; empty when the list failed. */
	patches: string[];
	ddragonVersion: string;
	/** For the header search's suggestions. */
	championNames: string[];
}

/**
 * The champion a page's URL segment names: an exact match on Data Dragon's id
 * or display name, compared as the search compares them. undefined if none.
 */
export function resolveChampion(
	champions: Record<number, Named>,
	segment: string
): { championId: number; champion: Named } | undefined {
	const key = champKey(segment);
	if (!key) return undefined;
	for (const [id, champion] of Object.entries(champions)) {
		if (champKey(champion.id) === key || champKey(champion.name) === key) {
			return { championId: Number(id), champion };
		}
	}
	return undefined;
}

/**
 * The champion a page's URL names, with the Data Dragon version its icons
 * come from. Not found when no champion matches; unavailable without the
 * lookups, since the URL can't be resolved.
 */
export async function findChampionPage(
	segment: string,
	{ client = proxy }: { client?: ProxyClient } = {}
): Promise<{ championId: number; champion: Named; ddragonVersion: string }> {
	const ddragonVersion = await currentPatch(client);
	const names = await staticNames(ddragonVersion, client).catch((e: unknown) => {
		console.error('Data Dragon lookups unavailable:', e);
		error(503, 'Temporarily unavailable');
	});
	const found = resolveChampion(names.champions, segment);
	if (!found) error(404, 'Not found');
	return { ...found, ddragonVersion };
}

/**
 * A champion's page for a role and patch, from three riot-proxy routes and the
 * champion's patch list, fetched in parallel. The detail is essential; the set
 * builds, matchups and patch list each fail on their own. Without a role, the
 * set builds name the champion's most-played one, and the matchups follow it.
 */
export async function loadChampionPage(
	found: { championId: number; champion: Named; ddragonVersion: string },
	filter: ChampionFilter,
	{ client = proxy }: { client?: ProxyClient } = {}
): Promise<ChampionPage> {
	const { ddragonVersion } = found;
	// Held in memory for the current patch (ADR-013), so this costs nothing more.
	const names = await staticNames(ddragonVersion, client);

	const path = { championId: found.championId };
	const [detail, builds, matchups, patches] = await Promise.all([
		client.GET('/v1/lol/analytics/champions/{championId}', {
			params: { path, query: analyticsQuery(filter, 10) }
		}),
		client.GET('/v1/lol/analytics/champions/{championId}/builds', {
			params: { path, query: analyticsQuery(filter) }
		}),
		client.GET('/v1/lol/analytics/champions/{championId}/matchups', {
			params: { path, query: analyticsQuery(filter, 200) }
		}),
		client.GET('/v1/lol/analytics/patches', {
			params: { query: { queue: ANALYTICS_QUEUE, championId: found.championId } }
		})
	]);
	if (!detail.response.ok || !detail.data) toHttpError(detail.response, detail.error);
	for (const [label, r] of [
		['builds', builds],
		['matchups', matchups],
		['patches', patches]
	] as const) {
		if (!r.response.ok)
			console.error(`champion ${found.championId} ${label} unavailable:`, r.response.status);
	}

	const setBuilds = builds.response.ok && builds.data ? toSetBuilds(builds.data, names) : null;
	const matchupRole = ROLES.find((r) => r.slug === filter.role)?.proxy ?? setBuilds?.role ?? null;

	return {
		championId: found.championId,
		champion: found.champion,
		patch: detail.data.patch,
		stats: toChampionStats(detail.data.stats),
		tiers: toTierRows(detail.data.byTier),
		setBuilds,
		popular: toPopularChoices(detail.data, names),
		matchups:
			matchups.response.ok && matchups.data
				? toMatchups(matchups.data.matchups, matchupRole, names)
				: null,
		matchupRole,
		patches: patchOptions(patches.response.ok ? patches.data : undefined),
		ddragonVersion,
		championNames: championNames(names.champions)
	};
}
