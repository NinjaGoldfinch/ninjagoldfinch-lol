import type { Shard } from '#lib/api/cdragon.ts';
import type { ItemCatalog, Rune, StaticNames } from '#lib/api/ddragon.ts';
import type { RunePage, Timeline } from '#lib/api/match.ts';
import { itemName } from './names.ts';

// One player's build from the match timeline, by riot-proxy's definitions
// (BLD-04; its showcase's `playerBuild`, held to the same golden fixture).
// ADR-032.

/** Purchases before this are the starter. */
const STARTER_MS = 60_000;
/** Base Boots, which aren't a player's boots choice. */
const BASE_BOOTS = 1001;
/** At most this many finished items are kept: an inventory's six slots. */
const ITEMS_KEPT = 6;
/**
 * Purchases less than this far apart are one shop visit. A display choice, not
 * Riot's: the timeline has no event for opening or closing the shop.
 */
const SHOP_VISIT_GAP_MS = 30_000;
/** The skill grid's fewest columns: one per level up to 18. */
const SKILL_COLUMNS = 18;

export const SKILL_KEYS = ['Q', 'W', 'E', 'R'] as const;

/** An item bought, at `t` ms. */
export interface Purchase {
	itemId: number;
	t: number;
}

/** A skill point: `slot` 1–4 for Q, W, E and R, at `t` ms. */
export interface LevelUp {
	slot: number;
	t: number;
}

/** What `playerBuild` works out; item ids, times in ms. */
export interface PlayerBuild {
	/** What was bought, in order, less undone purchases. */
	purchases: Purchase[];
	/** Bought before 60 s, trinkets aside, sorted; null without item data. */
	starter: number[] | null;
	/** The first boots bought, or null. */
	boots: number | null;
	/** The first six finished items; null without item data. */
	items: Purchase[] | null;
	/** NORMAL skill points, in order. */
	levelUps: LevelUp[];
	/** Q, W and E as `QWE`, most points first; null with no skill points. */
	skillOrder: string | null;
}

/**
 * One player's build from a match-v5 timeline, the player found by puuid in
 * the timeline's own participants. Purchases are ITEM_PURCHASED in time order,
 * less undone ones: an ITEM_UNDO with `afterId: 0` removes the latest earlier
 * purchase of `beforeId`. Sales and their undos are ignored: a build is what
 * was bought. Only NORMAL level-ups count. Without a catalogue, `starter` and
 * `items` are null; with one, an item it doesn't know is left out of
 * `starter`, `boots` and `items`, not guessed.
 */
export function playerBuild(
	timeline: Pick<Timeline, 'participants' | 'events'>,
	puuid: string | null,
	catalog: ItemCatalog | null
): PlayerBuild {
	const pid = puuid ? timeline.participants.find((p) => p.puuid === puuid)?.participantId : null;
	const events = pid
		? timeline.events
				.filter((e) => e.participantId === pid)
				.sort((a, b) => a.timestamp - b.timestamp)
		: [];

	const purchases: Purchase[] = [];
	for (const e of events) {
		if (e.type === 'ITEM_PURCHASED') purchases.push({ itemId: e.itemId, t: e.timestamp });
		if (e.type === 'ITEM_UNDO' && e.afterId === 0 && e.beforeId) {
			const k = purchases.findLastIndex((p) => p.itemId === e.beforeId && p.t <= e.timestamp);
			if (k !== -1) purchases.splice(k, 1);
		}
	}
	const levelUps = events.flatMap((e) =>
		e.type === 'SKILL_LEVEL_UP' && e.levelUpType === 'NORMAL'
			? [{ slot: e.skillSlot, t: e.timestamp }]
			: []
	);

	const known = catalog ? purchases.filter((p) => catalog[p.itemId]) : [];
	return {
		purchases,
		starter: catalog
			? known
					.filter((p) => p.t < STARTER_MS && !catalog[p.itemId]?.trinket)
					.map((p) => p.itemId)
					.sort((a, b) => a - b)
			: null,
		boots: catalog ? (known.find((p) => isBoots(catalog, p.itemId))?.itemId ?? null) : null,
		items: catalog ? known.filter((p) => catalog[p.itemId]?.finished).slice(0, ITEMS_KEPT) : null,
		levelUps,
		skillOrder: skillOrder(levelUps.map((l) => l.slot))
	};
}

/**
 * Boots: tagged Boots other than base Boots, or built from such an item. The
 * second rule catches upgrades with no Boots tag, such as Gunmetal Greaves.
 */
function isBoots(catalog: ItemCatalog, id: number): boolean {
	const tagged = (x: number) => x !== BASE_BOOTS && Boolean(catalog[x]?.boots);
	return tagged(id) || (catalog[id]?.from ?? []).some(tagged);
}

/**
 * Q, W and E ranked by points at the end, a tie going to the one that reached
 * its count first. null with no skill points.
 */
export function skillOrder(slots: number[]): string | null {
	if (slots.length === 0) return null;
	const points = [0, 0, 0];
	const reached = [Infinity, Infinity, Infinity];
	slots.forEach((slot, k) => {
		if (slot >= 1 && slot <= 3) {
			points[slot - 1] += 1;
			reached[slot - 1] = k;
		}
	});
	return [0, 1, 2]
		.sort((a, b) => points[b] - points[a] || reached[a] - reached[b])
		.map((i) => SKILL_KEYS[i])
		.join('');
}

/**
 * The skill grid's columns, numbered 1 to n: the n-th point taken, whatever
 * level it came at. At least 18, and more when a player took more points:
 * Triple Tonic grants an extra point at level 9, so Udyr, whose abilities have
 * more ranks than he has levels, can take 19. ADR-036.
 */
export function skillColumns(points: number): number[] {
	return Array.from({ length: Math.max(SKILL_COLUMNS, points) }, (_, i) => i + 1);
}

/** Purchases grouped into shop visits: one less than 30 s after the last joins its visit. */
export function shopVisits(purchases: Purchase[]): { t: number; items: number[] }[] {
	const visits: { t: number; last: number; items: number[] }[] = [];
	for (const p of purchases) {
		const visit = visits.at(-1);
		if (visit && p.t - visit.last < SHOP_VISIT_GAP_MS) {
			visit.items.push(p.itemId);
			visit.last = p.t;
		} else visits.push({ t: p.t, last: p.t, items: [p.itemId] });
	}
	return visits.map(({ t, items }) => ({ t, items }));
}

/** `Q › W › E`. */
export function formatSkillOrder(order: string): string {
	return [...order].join(' › ');
}

/** An item with its name; `count` of it in a row. */
export interface StackedItem {
	id: number;
	name: string;
	count: number;
}

/** Item ids named, the same item more than once a single entry with a count where it first appears. */
export function stackItems(ids: number[], names: Pick<StaticNames, 'items'>): StackedItem[] {
	const out: StackedItem[] = [];
	for (const id of ids) {
		const same = out.find((item) => item.id === id);
		if (same) same.count += 1;
		else out.push({ id, name: itemName(names, id), count: 1 });
	}
	return out;
}

/** A finished item and when it was bought, in seconds. */
export interface TimedItem {
	id: number;
	name: string;
	at: number;
}

/** A player's build from the timeline, named for the page. */
export interface TimelineBuild {
	/** Starter, boots and finished items; null without item data. */
	core: { starter: StackedItem[]; boots: StackedItem | null; items: TimedItem[] } | null;
	/** `Q`, `W` and `E` most points first; null with no skill points. */
	skillOrder: string | null;
	/** Skill slots (1–4) in the order levelled, each with its time in seconds. */
	skills: { slot: number; at: number }[];
	/** Purchases grouped into shop visits, each with its time in seconds. */
	visits: { at: number; items: StackedItem[] }[];
}

export interface RunePageView {
	primary: { path: Rune | null; runes: (Rune | null)[] };
	secondary: { path: Rune | null; runes: (Rune | null)[] };
	/** Offense, flex and defense; null when CommunityDragon's names are unavailable. */
	shards: (Shard | null)[];
}

/** One player's build: only what the page renders. */
export interface Build {
	participantId: number;
	/** Items and skills; null without a timeline. */
	timeline: TimelineBuild | null;
	runes: RunePageView;
}

/** `playerBuild` named for the page, times in seconds. */
export function toTimelineBuild(build: PlayerBuild, names: StaticNames): TimelineBuild {
	return {
		core:
			build.starter && build.items
				? {
						starter: stackItems(build.starter, names),
						boots:
							build.boots === null
								? null
								: { id: build.boots, name: itemName(names, build.boots), count: 1 },
						items: build.items.map((p) => ({
							id: p.itemId,
							name: itemName(names, p.itemId),
							at: seconds(p.t)
						}))
					}
				: null,
		skillOrder: build.skillOrder,
		skills: build.levelUps.map((l) => ({ slot: l.slot, at: seconds(l.t) })),
		visits: shopVisits(build.purchases).map((v) => ({
			at: seconds(v.t),
			items: stackItems(v.items, names)
		}))
	};
}

function seconds(ms: number): number {
	return Math.floor(ms / 1000);
}

/** A rune page named for the page: Data Dragon's runes, CommunityDragon's stat shards. */
export function toRunePage(
	page: RunePage,
	names: StaticNames,
	shards: Record<number, Shard>
): RunePageView {
	const rune = (id: number | null) => (id !== null && names.runes[id]) || null;
	return {
		primary: { path: rune(page.primary.style), runes: page.primary.perks.map(rune) },
		secondary: { path: rune(page.secondary.style), runes: page.secondary.perks.map(rune) },
		shards: page.shards.map((id) => shards[id] ?? null)
	};
}
