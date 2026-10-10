import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseStatShards } from '#lib/api/cdragon.ts';
import { parseItemCatalog, type ItemCatalog } from '#lib/api/ddragon.ts';
import {
	parseMatch,
	parseTimeline,
	type Participant,
	type Timeline,
	type TimelineEvent
} from '#lib/api/match.ts';
import {
	SKILL_KEYS,
	playerBuild,
	shopVisits,
	skillOrder,
	stackItems,
	toRunePage,
	toTimelineBuild
} from '#lib/domain/builds.ts';
import { MATCH_PATH, TIMELINE_PATH, fixtureBody, recordedNames } from './fixtures.ts';

const names = recordedNames();
const timeline = parseTimeline(fixtureBody(TIMELINE_PATH)) as Timeline;
const shards = parseStatShards(
	fixtureBody('/16.20/plugins/rcp-be-lol-game-data/global/default/v1/perks.json')
);
const AHRI = 8;
const ahriPuuid = timeline.participants.find((p) => p.participantId === AHRI)?.puuid ?? null;

// riot-proxy's build fixtures and its golden answers (tests/fixtures/builds/README.md).
const BUILDS = join(import.meta.dirname, '../fixtures/builds');
const read = (file: string): unknown => JSON.parse(readFileSync(join(BUILDS, file), 'utf8'));
const goldenTimeline = parseTimeline(read('OC1_711969250.timeline.json')) as Timeline;
const goldenCatalog = parseItemCatalog(read('item-16.19.1.json'));
const golden = read('OC1_711969250.expected.json') as Record<
	string,
	{ starter: number[]; boots: number | null; items: number[]; skills: string; skillOrder: string }
>;

describe("playerBuild against riot-proxy's golden builds", () => {
	it.each(Object.keys(golden))('%s', (puuid) => {
		const build = playerBuild(goldenTimeline, puuid, goldenCatalog);
		expect({
			starter: build.starter,
			boots: build.boots,
			items: build.items?.map((p) => p.itemId),
			skills: build.levelUps
				.slice(0, 15)
				.map((l) => SKILL_KEYS[l.slot - 1])
				.join(''),
			skillOrder: build.skillOrder
		}).toEqual(golden[puuid]);
	});

	it('covers all ten players', () => {
		expect(Object.keys(golden)).toHaveLength(10);
	});
});

describe('playerBuild', () => {
	const at = (participantId: number, puuid: string) => ({ participantId, puuid });
	const buy = (timestamp: number, itemId: number, participantId = 1): TimelineEvent => ({
		type: 'ITEM_PURCHASED',
		participantId,
		timestamp,
		itemId
	});
	const skill = (timestamp: number, skillSlot: number, levelUpType = 'NORMAL'): TimelineEvent => ({
		type: 'SKILL_LEVEL_UP',
		participantId: 1,
		timestamp,
		skillSlot,
		levelUpType
	});
	const item = (overrides: Partial<ItemCatalog[number]> = {}): ItemCatalog[number] => ({
		finished: false,
		boots: false,
		trinket: false,
		from: [],
		...overrides
	});
	const catalog: ItemCatalog = {
		1001: item({ boots: true }),
		1055: item(),
		2003: item(),
		3340: item({ trinket: true }),
		3031: item({ finished: true }),
		3172: item({ from: [3006] }),
		3006: item({ boots: true, from: [1001] })
	};
	const of = (events: TimelineEvent[], cat: ItemCatalog | null = catalog) =>
		playerBuild({ participants: [at(1, 'me'), at(2, 'other')], events }, 'me', cat);

	it("keeps only the player's own events, in time order", () => {
		const build = of([buy(2000, 2003), buy(1000, 1055), buy(1500, 2003, 2), buy(1600, 2003, 0)]);
		expect(build.purchases).toEqual([
			{ itemId: 1055, t: 1000 },
			{ itemId: 2003, t: 2000 }
		]);
	});

	it('removes the latest earlier purchase an undo names, and ignores sales', () => {
		const build = of([
			buy(1000, 2003),
			buy(2000, 2003),
			{ type: 'ITEM_SOLD', participantId: 1, timestamp: 2500, itemId: 1055 },
			{ type: 'ITEM_UNDO', participantId: 1, timestamp: 3000, beforeId: 2003, afterId: 0 },
			// An undone sale is not a purchase to remove.
			{ type: 'ITEM_UNDO', participantId: 1, timestamp: 4000, beforeId: 0, afterId: 2003 }
		]);
		expect(build.purchases).toEqual([{ itemId: 2003, t: 1000 }]);
	});

	it('takes the starter before 60 s less trinkets, sorted, keeping duplicates', () => {
		const build = of([buy(0, 3340), buy(0, 2003), buy(0, 1055), buy(1, 2003), buy(60000, 2003)]);
		expect(build.starter).toEqual([1055, 2003, 2003]);
	});

	it('takes boots by tag, or built from tagged boots, never base Boots', () => {
		expect(of([buy(1000, 1001), buy(2000, 3006)]).boots).toBe(3006);
		// Gunmetal Greaves has no Boots tag.
		expect(of([buy(1000, 1001), buy(2000, 3172)]).boots).toBe(3172);
		expect(of([buy(1000, 1001)]).boots).toBeNull();
	});

	it('keeps finished items with their times, and leaves out unknown items', () => {
		const build = of([buy(1000, 9999), buy(500000, 3031)]);
		expect(build.items).toEqual([{ itemId: 3031, t: 500000 }]);
		expect(build.purchases).toHaveLength(2);
	});

	it('without item data, keeps purchases and skills but no starter or items', () => {
		const build = of([buy(0, 1055), skill(1000, 1)], null);
		expect(build.starter).toBeNull();
		expect(build.items).toBeNull();
		expect(build.purchases).toEqual([{ itemId: 1055, t: 0 }]);
		expect(build.levelUps).toEqual([{ slot: 1, t: 1000 }]);
	});

	it('counts only NORMAL skill points', () => {
		expect(
			of([skill(1, 1), skill(2, 4, 'EVOLVE'), skill(3, 2)]).levelUps.map((l) => l.slot)
		).toEqual([1, 2]);
	});

	it('is empty for a player not in the timeline', () => {
		const build = playerBuild(
			{ participants: [at(1, 'me')], events: [buy(0, 1055)] },
			'stranger',
			catalog
		);
		expect(build.purchases).toEqual([]);
		expect(build.skillOrder).toBeNull();
	});
});

describe('skillOrder', () => {
	it('ranks Q, W and E by points, a tie to the one that got there first', () => {
		expect(skillOrder([1, 2, 3, 1, 1, 4, 1, 2, 1, 2])).toBe('QWE');
		// W and E have two each; E reached two first.
		expect(skillOrder([2, 3, 3, 2, 1])).toBe('EWQ');
		expect(skillOrder([])).toBeNull();
	});
});

describe('shopVisits', () => {
	it('joins purchases less than 30 s after the last one', () => {
		expect(
			shopVisits([
				{ itemId: 1, t: 0 },
				{ itemId: 2, t: 29999 },
				{ itemId: 3, t: 59000 },
				{ itemId: 4, t: 89000 }
			])
		).toEqual([
			{ t: 0, items: [1, 2, 3] },
			{ t: 89000, items: [4] }
		]);
	});
});

describe('stackItems', () => {
	it('names items and stacks repeats where they first appear', () => {
		expect(stackItems([2003, 1055, 2003], { 2003: 'Health Potion' })).toEqual([
			{ id: 2003, name: 'Health Potion', count: 2 },
			{ id: 1055, name: 'Item 1055', count: 1 }
		]);
	});
});

describe('toTimelineBuild', () => {
	const build = toTimelineBuild(playerBuild(timeline, ahriPuuid, names.itemCatalog), names);

	it("names the recorded player's starter, finished items and skill order", () => {
		expect(build.core?.starter.map((i) => [i.name, i.count])).toEqual([
			["Doran's Ring", 1],
			['Health Potion', 2]
		]);
		expect(build.core?.items[0]).toEqual({
			id: expect.any(Number),
			name: expect.any(String),
			at: expect.any(Number)
		});
		expect(build.skillOrder).toBe('QWE');
		expect(build.skills.map((s) => s.slot)).toEqual([
			2, 1, 3, 1, 1, 4, 1, 2, 1, 2, 4, 2, 2, 3, 3, 4
		]);
		expect(build.visits[0].at).toBe(15);
	});

	it('has no core without item data', () => {
		const bare = toTimelineBuild(playerBuild(timeline, ahriPuuid, null), names);
		expect(bare.core).toBeNull();
		expect(bare.visits.length).toBeGreaterThan(0);
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
