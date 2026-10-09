import type { Shard } from '#lib/api/cdragon.ts';
import type { Rune, StaticNames } from '#lib/api/ddragon.ts';
import type { RunePage, TimelineEvent } from '#lib/api/match.ts';

/** One bought or sold item in a player's build; `count` of it in that minute. */
export interface BuildItem {
	id: number;
	name: string;
	sold: boolean;
	count: number;
}

/** What a player bought and sold in one minute of the game. */
export interface ItemStep {
	minute: number;
	items: BuildItem[];
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
	/** Purchases and sales by minute; null without a timeline. */
	items: ItemStep[] | null;
	/** Skill slots (1–4: Q, W, E, R) in the order levelled; null without a timeline. */
	skills: number[] | null;
	runes: RunePageView;
}

export const SKILL_KEYS = ['Q', 'W', 'E', 'R'] as const;

/**
 * A player's purchases and sales, grouped by game minute. An undo cancels the
 * player's latest purchase or sale of the item it names, whichever field
 * Riot names it in (ADR-026). Items consumed by an upgrade stay in the list:
 * they were bought. The same item bought (or sold) more than once in a minute
 * is one entry with a count, where it first appears.
 */
export function itemSteps(
	events: TimelineEvent[],
	participantId: number,
	names: StaticNames
): ItemStep[] {
	const actions: { minute: number; id: number; sold: boolean }[] = [];
	for (const e of events) {
		if (e.participantId !== participantId) continue;
		if (e.type === 'ITEM_PURCHASED' || e.type === 'ITEM_SOLD') {
			actions.push({
				minute: Math.floor(e.timestamp / 60000),
				id: e.itemId,
				sold: e.type === 'ITEM_SOLD'
			});
		} else if (e.type === 'ITEM_UNDO') {
			const id = e.beforeId || e.afterId;
			const last = actions.findLastIndex((a) => a.id === id);
			if (last !== -1) actions.splice(last, 1);
		}
	}

	const steps: ItemStep[] = [];
	for (const { minute, id, sold } of actions) {
		let step = steps.at(-1);
		if (step?.minute !== minute) {
			step = { minute, items: [] };
			steps.push(step);
		}
		const same = step.items.find((item) => item.id === id && item.sold === sold);
		if (same) same.count += 1;
		else step.items.push({ id, name: names.items[id] ?? `Item ${id}`, sold, count: 1 });
	}
	return steps;
}

/** The skills a player levelled, in order. Evolutions are not skill points. */
export function skillOrder(events: TimelineEvent[], participantId: number): number[] {
	return events.flatMap((e) =>
		e.type === 'SKILL_LEVEL_UP' && e.participantId === participantId && e.levelUpType !== 'EVOLVE'
			? [e.skillSlot]
			: []
	);
}

/**
 * Q, W and E in the order the player maxed them: by when each took its fifth
 * point. Those not maxed follow, most points first, then the first taken.
 */
export function maxOrder(skills: number[]): number[] {
	const maxedAt = (slot: number) => {
		let points = 0;
		const at = skills.findIndex((s) => s === slot && ++points === 5);
		return at === -1 ? Infinity : at;
	};
	const points = (slot: number) => skills.filter((s) => s === slot).length;
	return [1, 2, 3]
		.filter((slot) => points(slot) > 0)
		.sort(
			(a, b) =>
				maxedAt(a) - maxedAt(b) || points(b) - points(a) || skills.indexOf(a) - skills.indexOf(b)
		);
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
