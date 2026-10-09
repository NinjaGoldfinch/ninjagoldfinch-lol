import { describe, expect, it } from 'vitest';
import { parseStatShards } from '#lib/api/cdragon.ts';
import {
	parseMatch,
	parseTimeline,
	type Participant,
	type Timeline,
	type TimelineEvent
} from '#lib/api/match.ts';
import { itemSteps, maxOrder, skillOrder, toRunePage } from '#lib/domain/builds.ts';
import { MATCH_PATH, TIMELINE_PATH, fixtureBody, recordedNames } from './fixtures.ts';

const names = recordedNames();
const timeline = parseTimeline(fixtureBody(TIMELINE_PATH)) as Timeline;
const shards = parseStatShards(
	fixtureBody('/16.20/plugins/rcp-be-lol-game-data/global/default/v1/perks.json')
);
const AHRI = 8;

describe('itemSteps', () => {
	const steps = itemSteps(timeline.events, AHRI, names);
	const ids = (minute: number) => steps.find((s) => s.minute === minute)?.items.map((i) => i.id);

	it("groups the recorded player's purchases by minute", () => {
		expect(steps[0]).toEqual({
			minute: 0,
			items: [1056, 2003, 2003, 3340].map((id) => ({
				id,
				name: names.items[id] ?? `Item ${id}`,
				sold: false
			}))
		});
		expect(steps.map((s) => s.minute)).toEqual([
			0, 2, 5, 6, 7, 10, 12, 13, 15, 16, 19, 20, 22, 23, 26, 27
		]);
	});

	it('drops an undone purchase', () => {
		// Bought Amplifying Tome twice at 15 minutes and undid one.
		expect(ids(15)).toEqual([3057, 1052]);
	});

	it('keeps a sale, marked as sold', () => {
		const sold = steps.find((s) => s.minute === 16)?.items[0];
		expect(sold).toEqual({ id: 2031, name: expect.any(String), sold: true });
		expect(ids(16)).toEqual([2031, 3113, 3364, 3363]);
	});

	it("cancels the latest buy or sale of the undo's item, whichever field names it", () => {
		const events: TimelineEvent[] = [
			{ type: 'ITEM_PURCHASED', participantId: 1, timestamp: 1000, itemId: 2055 },
			{ type: 'ITEM_PURCHASED', participantId: 1, timestamp: 2000, itemId: 3364 },
			{ type: 'ITEM_UNDO', participantId: 1, timestamp: 3000, beforeId: 0, afterId: 3364 },
			{ type: 'ITEM_SOLD', participantId: 1, timestamp: 4000, itemId: 2055 },
			{ type: 'ITEM_UNDO', participantId: 1, timestamp: 5000, beforeId: 0, afterId: 2055 },
			{ type: 'ITEM_PURCHASED', participantId: 2, timestamp: 6000, itemId: 1001 }
		];
		expect(itemSteps(events, 1, names)).toEqual([
			{ minute: 0, items: [{ id: 2055, name: names.items[2055], sold: false }] }
		]);
	});
});

describe('skillOrder', () => {
	it('lists the recorded skill points in order', () => {
		expect(skillOrder(timeline.events, AHRI)).toEqual([
			2, 1, 3, 1, 1, 4, 1, 2, 1, 2, 4, 2, 2, 3, 3, 4
		]);
	});

	it('leaves out evolutions', () => {
		const events: TimelineEvent[] = [
			{
				type: 'SKILL_LEVEL_UP',
				participantId: 1,
				timestamp: 1,
				skillSlot: 1,
				levelUpType: 'NORMAL'
			},
			{
				type: 'SKILL_LEVEL_UP',
				participantId: 1,
				timestamp: 2,
				skillSlot: 4,
				levelUpType: 'EVOLVE'
			}
		];
		expect(skillOrder(events, 1)).toEqual([1]);
	});
});

describe('maxOrder', () => {
	it('orders Q, W and E by when each was maxed', () => {
		expect(maxOrder([2, 1, 3, 1, 1, 4, 1, 2, 1, 2, 4, 2, 2, 3, 3, 4])).toEqual([1, 2, 3]);
		expect(maxOrder([1, 3, 2, 3, 3, 4, 3, 3, 1, 1, 4, 1, 1, 2, 2, 4, 2, 2])).toEqual([3, 1, 2]);
	});

	it('puts unmaxed skills after, most points first', () => {
		expect(maxOrder([3, 1, 2, 1, 2, 4, 1])).toEqual([1, 2, 3]);
		expect(maxOrder([])).toEqual([]);
	});
});

describe('toRunePage', () => {
	const ahri = parseMatch(fixtureBody(MATCH_PATH))?.participants[7] as Participant;

	it('names every rune on the page, and the stat shards', () => {
		const page = toRunePage(ahri.runePage, names, shards);
		expect(page.primary.path?.name).toBe('Sorcery');
		expect(page.primary.runes.map((r) => r?.name)).toEqual([
			'Deathfire Touch',
			names.runes[8226]?.name,
			names.runes[8210]?.name,
			names.runes[8237]?.name
		]);
		expect(page.secondary.path?.name).toBe('Precision');
		expect(page.secondary.runes).toHaveLength(2);
		expect(page.shards.map((s) => s?.name)).toEqual([
			'Attack Speed',
			'Adaptive Force',
			'Health Scaling'
		]);
		expect(page.shards[0]?.icon).toBe('perk-images/statmods/statmodsattackspeedicon.png');
	});

	it('leaves the shards unnamed without CommunityDragon', () => {
		expect(toRunePage(ahri.runePage, names, {}).shards).toEqual([null, null, null]);
	});
});
