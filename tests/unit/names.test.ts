import { describe, expect, it } from 'vitest';
import { championName, itemName, queueName } from '#lib/domain/names.ts';

const names = {
	items: { 3089: "Rabadon's Deathcap" },
	queues: { 420: 'Ranked Solo' },
	champions: { 103: { id: 'Ahri', name: 'Ahri' } }
};

describe('itemName', () => {
	it('names an item, or falls back to its id', () => {
		expect(itemName(names, 3089)).toBe("Rabadon's Deathcap");
		expect(itemName(names, 1055)).toBe('Item 1055');
	});
});

describe('queueName', () => {
	it('names a queue, or falls back to its id, or to unknown without one', () => {
		expect(queueName(names, 420)).toBe('Ranked Solo');
		expect(queueName(names, 1700)).toBe('Queue 1700');
		expect(queueName(names, null)).toBe('Unknown queue');
	});
});

describe('championName', () => {
	it("prefers Data Dragon's name, then riot-proxy's, then the id", () => {
		expect(championName(names, 103, 'Proxy Ahri')).toBe('Ahri');
		expect(championName(names, 1, 'Annie')).toBe('Annie');
		expect(championName(names, 1, null)).toBe('Champion 1');
		expect(championName(names, 1)).toBe('Champion 1');
	});
});
