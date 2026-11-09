import { describe, expect, it } from 'vitest';
import { MAX_RECENT, addRecent, parseRecent, type RecentSearch } from '#lib/domain/recent.ts';

const faker: RecentSearch = { gameName: 'Hide on bush', tagLine: 'KR1' };
const other: RecentSearch = { gameName: 'Someone', tagLine: 'OCE' };

describe('addRecent', () => {
	it('puts the newest first and drops an earlier copy, ignoring case', () => {
		const list = addRecent([faker, other], { ...faker, gameName: 'hide ON bush' });
		expect(list).toHaveLength(2);
		expect(list[0].gameName).toBe('hide ON bush');
		expect(list[1]).toEqual(other);
	});

	it(`keeps at most ${MAX_RECENT}`, () => {
		let list: RecentSearch[] = [];
		for (let i = 0; i < MAX_RECENT + 3; i++) {
			list = addRecent(list, { gameName: `p${i}`, tagLine: 'OCE' });
		}
		expect(list).toHaveLength(MAX_RECENT);
		expect(list[0].gameName).toBe(`p${MAX_RECENT + 2}`);
	});
});

describe('parseRecent', () => {
	it('reads a stored list', () => {
		expect(parseRecent(JSON.stringify([faker]))).toEqual([faker]);
	});

	it('ignores missing, malformed and wrongly shaped values', () => {
		expect(parseRecent(null)).toEqual([]);
		expect(parseRecent('not json')).toEqual([]);
		expect(parseRecent('{"a":1}')).toEqual([]);
		expect(parseRecent(JSON.stringify([faker, { region: 'kr' }, 7]))).toEqual([faker]);
	});

	it('keeps a known region, once per player, the newest copy first', () => {
		const stored = [
			{ region: 'kr', ...faker },
			{ region: 'oce', ...other },
			{ region: 'euw', ...faker, gameName: 'HIDE ON BUSH' }
		];
		expect(parseRecent(JSON.stringify(stored))).toEqual([
			{ region: 'kr', ...faker },
			{ region: 'oce', ...other }
		]);
	});

	it('keeps the region a profile loaded with before ADR-037', () => {
		const stored = [{ region: 'kr', gameName: 'Hide on bush', tagLine: 'KR1' }];
		expect(parseRecent(JSON.stringify(stored))).toEqual([{ ...faker, region: 'kr' }]);
	});

	it('reads back everything a profile records', () => {
		const full: RecentSearch = {
			gameName: 'NinjaGoldfinch',
			tagLine: 'OCENZ',
			region: 'oce',
			profileIconId: 7173,
			rank: 'Emerald III',
			viewedAt: 1_762_650_000_000
		};
		expect(parseRecent(JSON.stringify([full]))).toEqual([full]);
	});

	it('reads an entry stored before icons and ranks as a bare Riot ID', () => {
		expect(parseRecent(JSON.stringify([faker]))).toEqual([faker]);
		expect(Object.keys(parseRecent(JSON.stringify([faker]))[0])).toEqual(['gameName', 'tagLine']);
	});

	it('leaves out each field that is not well-formed, keeping the entry', () => {
		const stored = [
			{ ...faker, region: 'mars', profileIconId: -1, rank: '', viewedAt: 'x' },
			{ ...other, region: 'OCE', profileIconId: 1.5, rank: 7, viewedAt: Number.NaN }
		];
		expect(parseRecent(JSON.stringify(stored))).toEqual([faker, { ...other, region: 'oce' }]);
	});
});
