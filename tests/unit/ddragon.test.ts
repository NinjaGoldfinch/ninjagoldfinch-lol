import { describe, expect, it } from 'vitest';
import {
	parseItemCatalog,
	parseItemNames,
	parseKeyedNames,
	parseQueueNames,
	parseRunes
} from '#lib/api/ddragon.ts';
import { fixtureBody } from './fixtures.ts';

describe('Data Dragon lookups', () => {
	it('maps numeric champion ids to Data Dragon ids and names', () => {
		const champions = parseKeyedNames(fixtureBody('/v1/static/champion?version=16.20.1'));
		expect(champions[103]).toEqual({ id: 'Ahri', name: 'Ahri' });
		expect(champions[234]).toEqual({ id: 'Viego', name: 'Viego' });
	});

	it('maps numeric summoner spell ids the same way', () => {
		const spells = parseKeyedNames(fixtureBody('/v1/static/summoner?version=16.20.1'));
		expect(spells[4]).toEqual({ id: 'SummonerFlash', name: 'Flash' });
	});

	it('maps item ids to names', () => {
		expect(parseItemNames(fixtureBody('/v1/static/item?version=16.20.1'))[1056]).toBe(
			"Doran's Ring"
		);
	});

	it('shortens queue descriptions', () => {
		const queues = parseQueueNames(fixtureBody('/v1/static/queues'));
		expect(queues[420]).toBe('Ranked Solo');
		expect(queues[440]).toBe('Ranked Flex');
		expect(queues[450]).toBe('ARAM');
		expect(queues[480]).toBe('Swiftplay');
		expect(queues[1700]).toBe('Arena');
		expect(queues[0]).toBe('Custom');
	});

	it('maps rune paths and runes to names and icons', () => {
		const runes = parseRunes(fixtureBody('/v1/static/runesReforged?version=16.20.1'));
		expect(runes[8000]).toEqual({
			name: 'Precision',
			icon: 'perk-images/Styles/7201_Precision.png'
		});
		expect(runes[8112]).toEqual({
			name: 'Electrocute',
			icon: 'perk-images/Styles/Domination/Electrocute/Electrocute.png'
		});
	});

	it('ignores malformed input', () => {
		expect(parseKeyedNames(null)).toEqual({});
		expect(parseItemNames({ data: 'x' })).toEqual({});
		expect(parseQueueNames({})).toEqual({});
		expect(parseRunes([{ id: 1 }, null, { slots: 'x' }])).toEqual({});
	});
});

describe('parseItemCatalog', () => {
	const entry = (overrides: Record<string, unknown> = {}) => ({
		gold: { purchasable: true, total: 3000 },
		tags: [],
		...overrides
	});
	const catalog = parseItemCatalog({
		data: {
			3031: entry({ from: ['1038', '1018', 'x'] }),
			1038: entry({ gold: { purchasable: true, total: 1300 }, into: ['3031'] }),
			1500: entry({ gold: { purchasable: true, total: 1500 } }),
			3172: entry({ from: ['3006'] }),
			3006: entry({ gold: { purchasable: true, total: 1100 }, tags: ['Boots'] }),
			3340: entry({ gold: { purchasable: true, total: 0 }, tags: ['Trinket'] }),
			2138: entry({ tags: ['Consumable'] }),
			9999: entry({ gold: { purchasable: false, total: 3000 } }),
			abc: entry()
		}
	});

	it('marks finished items: purchasable, builds into nothing, 1500 gold or more', () => {
		expect(catalog[3031].finished).toBe(true);
		expect(catalog[1500].finished).toBe(true);
		expect(catalog[1038].finished).toBe(false);
		expect(catalog[9999].finished).toBe(false);
	});

	it('never counts boots, consumables or trinkets as finished', () => {
		expect(catalog[3006]).toEqual({ finished: false, boots: true, trinket: false, from: [] });
		expect(catalog[3340]).toMatchObject({ finished: false, trinket: true });
		expect(catalog[2138].finished).toBe(false);
	});

	it("keeps what an item is built from, and leaves out ids that aren't numbers", () => {
		expect(catalog[3031].from).toEqual([1038, 1018]);
		expect(catalog[3172]).toMatchObject({ boots: false, from: [3006] });
		expect(Object.keys(catalog)).not.toContain('abc');
	});
});
