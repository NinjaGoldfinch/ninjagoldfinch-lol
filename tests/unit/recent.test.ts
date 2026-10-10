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

	it('drops the region stored before profiles lost theirs, keeping each player once', () => {
		const stored = [
			{ region: 'kr', ...faker },
			{ region: 'oce', ...other },
			{ region: 'euw', ...faker, gameName: 'HIDE ON BUSH' }
		];
		expect(parseRecent(JSON.stringify(stored))).toEqual([faker, other]);
	});
});
