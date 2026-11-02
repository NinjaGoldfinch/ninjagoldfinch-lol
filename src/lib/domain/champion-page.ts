import type { components } from '#lib/api/schema.d.ts';
import type { Named, Rune, StaticNames } from '#lib/api/ddragon.ts';
import { stackItems, type StackedItem } from './builds.ts';
import { championSlug } from './champion-search.ts';
import { ROLES, TIERS, type RoleSlug } from './champion-stats.ts';
import { championName, itemName } from './names.ts';
import { titleCase } from './ranks.ts';

type Schemas = components['schemas'];
type StatEntry = Schemas['ChampionStatEntry'];

// A champion page's sections, named for the page from riot-proxy's champion
// detail, set builds and matchups. Every figure is a field riot-proxy sent;
// nothing is summed or estimated here. ADR-034.

/** A rate with the games behind it. */
export interface Rated {
	games: number;
	winRate: number;
}

export interface NamedItem {
	id: number;
	name: string;
}

/** The champion's rates over the slice; null when it has too few games. */
export interface ChampionStats extends Rated {
	pickRate: number | null;
	banRate: number | null;
}

/**
 * riot-proxy's summed row (`stats`). It carries the body's own `tier`: null
 * over every tier or a range, the tier when one was asked for.
 */
export function toChampionStats(
	stats: StatEntry[],
	tier: string | null = null
): ChampionStats | null {
	const row = stats.find((s) => s.tier === tier);
	return row
		? {
				games: row.games,
				winRate: row.winRate,
				pickRate: row.pickRate ?? null,
				banRate: row.banRate ?? null
			}
		: null;
}

/** Highest tier first; `UNKNOWN` (players no ladder or lookup placed) last. */
const TIER_ORDER: string[] = [...TIERS.map((t) => t.proxy), 'UNKNOWN'];

export interface TierRow extends ChampionStats {
	tier: string;
	label: string;
}

/** `byTier` in ladder order, labelled. A tier riot-proxy adds later sorts before UNKNOWN. */
export function toTierRows(byTier: StatEntry[]): TierRow[] {
	const rank = (tier: string) => {
		const i = TIER_ORDER.indexOf(tier);
		return i === -1 ? TIER_ORDER.length - 1.5 : i;
	};
	return byTier
		.flatMap((row) => (row.tier === null ? [] : [{ ...row, tier: row.tier }]))
		.sort((a, b) => rank(a.tier) - rank(b.tier))
		.map((row) => ({
			tier: row.tier,
			label: row.tier === 'UNKNOWN' ? 'Unplaced' : titleCase(row.tier),
			games: row.games,
			winRate: row.winRate,
			pickRate: row.pickRate ?? null,
			banRate: row.banRate ?? null
		}));
}

/** A keystone and secondary path, named; either null when Data Dragon lacks it. */
export interface RuneChoice {
	keystone: (Rune & { id: number }) | null;
	subStyle: (Rune & { id: number }) | null;
}

/** A pair of summoner spells, named; null when Data Dragon lacks one. */
export type SpellPair = [(Named & { key: number }) | null, (Named & { key: number }) | null];

/** One set build, with the top option of each part and every later item option. */
export interface SetBuild extends Rated {
	/** The first two finished items. */
	core: NamedItem[];
	/** Its share of the games with a build. */
	pickRate: number;
	/** The 3rd, 4th and 5th items: up to three options each, most played first. */
	next: (NamedItem & Rated)[][];
	/** The most played of each; null when nobody's choice was recorded. */
	starter: StackedItem[] | null;
	boots: NamedItem | null;
	skillOrder: string | null;
	runes: RuneChoice | null;
	spells: SpellPair | null;
}

export interface SetBuilds {
	/**
	 * riot-proxy's role for the builds: the one asked for, else the most
	 * played, or against an opponent the lane they met in most.
	 */
	role: string | null;
	/** Games in that role that had a build. */
	totalGames: number;
	builds: SetBuild[];
}

export function toSetBuilds(
	body: Schemas['ChampionBuildsResponse'],
	names: StaticNames
): SetBuilds {
	const item = (id: number): NamedItem => ({ id, name: itemName(names, id) });
	// Against an opponent riot-proxy keeps only the 3rd item of the path, so
	// the 4th and 5th come back empty and are left out (riot-proxy ADR-171).
	const against = body.opponentId !== null;
	return {
		role: body.role,
		totalGames: body.totalGames,
		builds: body.builds.map((b) => {
			const rune = b.runes[0];
			const spell = b.spells[0];
			return {
				core: b.core.map(item),
				games: b.games,
				winRate: b.winRate,
				pickRate: b.pickRate,
				next: b.next
					.map((options) =>
						options.map((o) => ({ ...item(o.itemId), games: o.games, winRate: o.winRate }))
					)
					.filter((options) => !against || options.length > 0),
				starter: b.starter[0] ? stackItems(b.starter[0].items, names) : null,
				boots: b.boots[0] ? item(b.boots[0].itemId) : null,
				skillOrder: b.skillOrder[0]?.order ?? null,
				runes: rune ? runeChoice(rune.keystoneId, rune.subStyleId, names) : null,
				spells: spell ? spellPair(spell.spellA, spell.spellB, names) : null
			};
		})
	};
}

/** The detail route's lists: what to show when there are no set builds yet. */
export interface PopularChoices {
	items: (NamedItem & Rated)[];
	runes: (RuneChoice & Rated)[];
	spells: { spells: SpellPair; games: number; winRate: number }[];
}

export function toPopularChoices(
	detail: Pick<Schemas['ChampionDetailResponse'], 'items' | 'runes' | 'spells'>,
	names: StaticNames
): PopularChoices {
	return {
		items: detail.items.map((i) => ({
			id: i.itemId,
			name: itemName(names, i.itemId),
			games: i.games,
			winRate: i.winRate
		})),
		runes: detail.runes.map((r) => ({
			...runeChoice(r.keystoneId, r.subStyleId, names),
			games: r.games,
			winRate: r.winRate
		})),
		spells: detail.spells.map((s) => ({
			spells: spellPair(s.spellA, s.spellB, names),
			games: s.games,
			winRate: s.winRate
		}))
	};
}

export interface Matchup extends Rated {
	opponentId: number;
	/** Data Dragon id, for the icon; null when the lookups lack it. */
	key: string | null;
	name: string;
	/** riot-proxy's role, e.g. `MIDDLE`. */
	role: string;
}

/** The lane opponents in `role` (every lane when null), most games first. */
export function toMatchups(
	entries: Schemas['ChampionMatchupEntry'][],
	role: string | null,
	names: StaticNames
): Matchup[] {
	return entries
		.filter((m) => role === null || m.role === role)
		.map((m) => ({
			opponentId: m.opponentId,
			key: names.champions[m.opponentId]?.id ?? null,
			name: championName(names, m.opponentId, m.opponentName),
			role: m.role,
			games: m.games,
			winRate: m.winRate
		}))
		.sort((a, b) => b.games - a.games || b.winRate - a.winRate);
}

/**
 * The lane opponent a champion page's builds are against: `?vs=syndra`, a
 * champion page's own URL segment, and optionally `&lane=mid`. The lane is
 * dropped when a role is picked, since the role is the lane. An unknown
 * champion drops the pick, an unknown lane only the lane. ADR-043.
 */
export interface VsPick {
	opponentId: number;
	/** The URL value, `syndra`. */
	slug: string;
	name: string;
	lane: RoleSlug | null;
}

export function parseVsPick(
	params: URLSearchParams,
	champions: Record<number, Named>,
	role: RoleSlug | null
): VsPick | null {
	// Slugs are lower case; `?vs=Syndra` names the same pick, and the page's
	// redirect writes it as `syndra`.
	const vs = params.get('vs')?.toLowerCase();
	if (!vs) return null;
	const found = Object.entries(champions).find(([, c]) => championSlug(c) === vs);
	if (!found) return null;
	const lane =
		role === null ? (ROLES.find((r) => r.slug === params.get('lane'))?.slug ?? null) : null;
	return { opponentId: Number(found[0]), slug: vs, name: found[1].name, lane };
}

/** A champion page's query with a pick added: `?rank=gold+&vs=syndra&lane=mid`. */
export function withPick(query: string, pick: Pick<VsPick, 'slug' | 'lane'> | null): string {
	if (!pick) return query;
	const lane = pick.lane ? `&lane=${pick.lane}` : '';
	return `${query}${query ? '&' : '?'}vs=${encodeURIComponent(pick.slug)}${lane}`;
}

/** One opponent the *vs* picker offers. */
export interface VsChoice {
	opponentId: number;
	slug: string;
	name: string;
	/** Games summed over every lane; null for a pick the matchups lack. */
	games: number | null;
}

/**
 * The *vs* picker's opponents, from the matchups the page already loaded:
 * each opponent once, its games summed over lanes, most first, ties by name.
 * A picked opponent the list lacks (another slice, an old link) goes last
 * without a count. Names are Data Dragon's: an opponent it doesn't know has
 * no URL value, so it isn't offered.
 * riot-proxy's showcase does the same (`vsChoices`, its ADR-172).
 */
export function vsChoices(
	entries: Schemas['ChampionMatchupEntry'][],
	picked: VsPick | null,
	names: StaticNames
): VsChoice[] {
	const byId = new Map<number, VsChoice>();
	for (const m of entries) {
		const champion = names.champions[m.opponentId];
		if (!champion) continue;
		const seen = byId.get(m.opponentId);
		if (seen) seen.games = (seen.games ?? 0) + m.games;
		else
			byId.set(m.opponentId, {
				opponentId: m.opponentId,
				slug: championSlug(champion),
				name: champion.name,
				games: m.games
			});
	}
	const choices = [...byId.values()].sort(
		(a, b) => (b.games ?? 0) - (a.games ?? 0) || a.name.localeCompare(b.name)
	);
	if (picked && !byId.has(picked.opponentId)) {
		choices.push({
			opponentId: picked.opponentId,
			slug: picked.slug,
			name: picked.name,
			games: null
		});
	}
	return choices;
}

/** `MIDDLE` → `Mid`, as the role tabs name it. */
export function roleLabel(proxyRole: string): string {
	return ROLES.find((r) => r.proxy === proxyRole)?.label ?? titleCase(proxyRole);
}

/** Which set build is open: `?build=2` is the second, 1-based; anything else the first. */
export function openBuild(value: string | null, count: number): number {
	const n = Number(value);
	return Number.isInteger(n) && n >= 1 && n <= count ? n - 1 : 0;
}

function runeChoice(keystoneId: number, subStyleId: number, names: StaticNames): RuneChoice {
	const rune = (id: number) => (names.runes[id] ? { id, ...names.runes[id] } : null);
	return { keystone: rune(keystoneId), subStyle: rune(subStyleId) };
}

function spellPair(a: number, b: number, names: StaticNames): SpellPair {
	const spell = (key: number) => (names.spells[key] ? { key, ...names.spells[key] } : null);
	return [spell(a), spell(b)];
}
