import { describe, expect, it } from 'vitest';
import type { components } from '#lib/api/schema.d.ts';
import { patchOf, toMatchRows } from '#lib/domain/matches.ts';
import { MATCHES_PATH, fixtureBody } from './fixtures.ts';

type MatchSummary = components['schemas']['MatchSummary'];
const { matches } = fixtureBody(MATCHES_PATH) as { matches: MatchSummary[] };

describe('toMatchRows', () => {
	it('shapes every recorded match', () => {
		const rows = toMatchRows(matches);
		expect(rows).toHaveLength(10);
		expect(rows[0]).toEqual({
			matchId: 'OC1_712351051',
			queueId: 420,
			playedAt: 1791519114644,
			duration: 1952,
			patch: '16.20',
			result: 'win',
			champion: { id: 103, name: 'Ahri', level: 16 },
			kills: 8,
			deaths: 8,
			assists: 10,
			cs: 181,
			items: [1056, 2503, 3100, 3171, 8010, 1052, 3363],
			spells: [14, 4],
			position: 'MIDDLE'
		});
	});

	it('marks an early surrender as a remake, not a loss', () => {
		const remake = {
			...matches[0],
			player: { ...matches[0].player, win: false, gameEndedInEarlySurrender: true }
		};
		expect(toMatchRows([remake])[0].result).toBe('remake');
	});

	it("drops summaries without the player's line or champion", () => {
		expect(toMatchRows([{ matchId: 'OC1_1', player: null }])).toEqual([]);
		expect(toMatchRows([{ matchId: 'OC1_2', player: { win: true } }])).toEqual([]);
	});
});

describe('patchOf', () => {
	it('takes major.minor from a game build', () => {
		expect(patchOf('16.20.824.8524')).toBe('16.20');
		expect(patchOf(null)).toBeNull();
		expect(patchOf('junk')).toBeNull();
	});
});
