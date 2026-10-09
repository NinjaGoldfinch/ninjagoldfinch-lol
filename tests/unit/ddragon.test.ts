import { describe, expect, it } from 'vitest';
import { parseItemNames, parseKeyedNames, parseQueueNames, parseRunes } from '#lib/api/ddragon.ts';
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
