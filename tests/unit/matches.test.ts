import { describe, expect, it } from 'vitest';
import type { components } from '#lib/api/schema.d.ts';
import {
	csPerMinute,
	formatDuration,
	kdaRatio,
	patchOf,
	toMatchRows
} from '#lib/domain/matches.ts';
import { MATCHES_PATH, fixtureBody, recordedNames } from './fixtures.ts';

type MatchSummary = components['schemas']['MatchSummary'];
const { matches } = fixtureBody(MATCHES_PATH) as { matches: MatchSummary[] };
const names = recordedNames();
// Two hours after the first recorded game started.
const now = 1791519114644 + 2 * 3600 * 1000;

describe('toMatchRows', () => {
	it('shapes every recorded match, with names from Data Dragon', () => {
		const rows = toMatchRows(matches, names, now);
		expect(rows).toHaveLength(10);
		expect(rows[0]).toEqual({
			matchId: 'OC1_712351051',
			queueId: 420,
			queue: 'Ranked Solo',
			playedAgo: '2 hours ago',
			duration: 1952,
			patch: '16.20',
			result: 'win',
			champion: { id: 103, key: 'Ahri', name: 'Ahri', level: 16 },
			kills: 8,
			deaths: 8,
			assists: 10,
			cs: 181,
			items: [
				{ id: 1056, name: "Doran's Ring" },
				{ id: 2503, name: names.items[2503] },
				{ id: 3100, name: names.items[3100] },
				{ id: 3171, name: names.items[3171] },
				{ id: 8010, name: names.items[8010] },
				{ id: 1052, name: names.items[1052] },
				{ id: 3363, name: names.items[3363] }
			],
			spells: [
				{ id: 'SummonerDot', name: 'Ignite' },
				{ id: 'SummonerFlash', name: 'Flash' }
			],
			position: 'MIDDLE'
		});
	});

	it('marks an early surrender as a remake, not a loss', () => {
		const p = matches[0].player;
		const remake = { ...matches[0], player: { ...p, win: false, gameEndedInEarlySurrender: true } };
		expect(toMatchRows([remake], names, now)[0].result).toBe('remake');
	});

	it('keeps rendering when the patch data lacks something', () => {
		const p = matches[0].player;
		const unknown = {
			...matches[0],
			queueId: 9999,
			player: { ...p, championId: 99999, championName: 'Newchamp', item0: 999999, item1: 0 }
		};
		const row = toMatchRows([unknown], names, now)[0];
		expect(row.queue).toBe('Queue 9999');
		expect(row.champion).toMatchObject({ key: null, name: 'Newchamp' });
		expect(row.items.slice(0, 2)).toEqual([{ id: 999999, name: 'Item 999999' }, null]);
	});

	it("drops summaries without the player's line or champion", () => {
		expect(toMatchRows([{ matchId: 'OC1_1', player: null }], names, now)).toEqual([]);
		expect(toMatchRows([{ matchId: 'OC1_2', player: { win: true } }], names, now)).toEqual([]);
	});
});

describe('match formatting', () => {
	it('takes major.minor from a game build', () => {
		expect(patchOf('16.20.824.8524')).toBe('16.20');
		expect(patchOf(null)).toBeNull();
		expect(patchOf('junk')).toBeNull();
	});

	it('formats durations', () => {
		expect(formatDuration(1952)).toBe('32:32');
		expect(formatDuration(65)).toBe('1:05');
		expect(formatDuration(3725)).toBe('1:02:05');
	});

	it('gives a KDA ratio, or Perfect with no deaths', () => {
		expect(kdaRatio(8, 8, 10)).toBe('2.25');
		expect(kdaRatio(3, 0, 4)).toBe('Perfect');
	});

	it('gives CS per minute', () => {
		expect(csPerMinute(181, 1952)).toBe('5.6');
		expect(csPerMinute(0, 0)).toBe('0.0');
	});
});
