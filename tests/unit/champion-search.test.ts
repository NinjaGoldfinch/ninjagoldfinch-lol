import { describe, expect, it } from 'vitest';
import type { Named } from '#lib/api/ddragon.ts';
import {
	champKey,
	championNames,
	championPath,
	championSlug,
	findChampion,
	searchHint
} from '#lib/domain/champion-search.ts';

const champions: Record<number, Named> = {
	254: { id: 'Vi', name: 'Vi' },
	234: { id: 'Viego', name: 'Viego' },
	145: { id: 'Kaisa', name: "Kai'Sa" },
	62: { id: 'MonkeyKing', name: 'Wukong' },
	103: { id: 'Ahri', name: 'Ahri' },
	1: { id: 'Annie', name: 'Annie' },
	20: { id: 'Nunu', name: 'Nunu & Willump' }
};

describe('champKey', () => {
	it('drops case, accents, spaces and punctuation', () => {
		expect(champKey("Kai'Sa")).toBe('kaisa');
		expect(champKey('KAI SA')).toBe('kaisa');
		expect(champKey('Nunu & Willump')).toBe('nunuwillump');
		expect(champKey('Ké')).toBe('ke');
	});
});

describe('findChampion', () => {
	const id = (query: string) => findChampion(champions, query).championId;

	it('matches the display name or Data Dragon id, however written', () => {
		expect(id('kaisa')).toBe(145);
		expect(id("Kai'Sa")).toBe(145);
		expect(id('Wukong')).toBe(62);
		expect(id('monkeyking')).toBe(62);
	});

	it('prefers an exact match to a longer name', () => {
		expect(id('Vi')).toBe(254);
	});

	it('takes a unique prefix', () => {
		expect(id('kais')).toBe(145);
		expect(id('nunu')).toBe(20);
	});

	it('lists the names an ambiguous prefix matches, and none for no match', () => {
		expect(findChampion(champions, 'a')).toEqual({ championId: null, matches: ['Ahri', 'Annie'] });
		expect(findChampion(champions, 'zzz')).toEqual({ championId: null, matches: [] });
		expect(findChampion(champions, "'")).toEqual({ championId: null, matches: [] });
	});
});

describe('championSlug and championPath', () => {
	it("use Data Dragon's id, lower-cased", () => {
		expect(championSlug(champions[62])).toBe('monkeyking');
		expect(championPath(champions[145])).toBe('/champions/kaisa');
	});
});

describe('searchHint', () => {
	it('says what to do next', () => {
		expect(searchHint('zzz', [])).toBe("No champion matches 'zzz'. A Riot ID needs its #TAG.");
		expect(searchHint('a', ['Ahri', 'Annie'])).toBe("'a' matches Ahri, Annie. Keep typing.");
		expect(searchHint('x', ['A', 'B', 'C', 'D', 'E', 'F'])).toBe(
			"'x' matches A, B, C, D, E and 1 more. Keep typing."
		);
	});
});

describe('championNames', () => {
	it('lists display names, sorted', () => {
		expect(championNames(champions).slice(0, 3)).toEqual(['Ahri', 'Annie', "Kai'Sa"]);
	});
});
