import { describe, expect, it } from 'vitest';
import type { LeagueEntry } from '#lib/api/riot.ts';
import { describeRanks, titleCase } from '#lib/domain/ranks.ts';

const entry = (over: Partial<LeagueEntry>): LeagueEntry => ({
	queueType: 'RANKED_SOLO_5x5',
	tier: 'EMERALD',
	rank: 'III',
	leaguePoints: 67,
	wins: 475,
	losses: 464,
	...over
});

describe('describeRanks', () => {
	it('names the queue and tier, with a whole-percent win rate', () => {
		expect(describeRanks([entry({})])).toEqual([
			{
				queue: 'Ranked Solo/Duo',
				tier: 'Emerald III',
				leaguePoints: 67,
				wins: 475,
				losses: 464,
				winRate: 51
			}
		]);
	});

	it('shows no division for apex tiers', () => {
		expect(describeRanks([entry({ tier: 'GRANDMASTER', rank: 'I' })])[0].tier).toBe('Grandmaster');
	});

	it('puts Solo/Duo before Flex and leaves other queues out', () => {
		const ranks = describeRanks([
			entry({ queueType: 'RANKED_FLEX_SR' }),
			entry({ queueType: 'CHERRY' }),
			entry({})
		]);
		expect(ranks.map((r) => r.queue)).toEqual(['Ranked Solo/Duo', 'Ranked Flex']);
	});

	it('gives 0% before any games', () => {
		expect(describeRanks([entry({ wins: 0, losses: 0 })])[0].winRate).toBe(0);
	});
});

describe('titleCase', () => {
	it('keeps the first letter and lowers the rest', () => {
		expect(titleCase('EMERALD')).toBe('Emerald');
		expect(titleCase('GRANDMASTER')).toBe('Grandmaster');
	});
});
