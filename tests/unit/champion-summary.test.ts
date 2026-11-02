import { describe, expect, it } from 'vitest';
import type { components } from '#lib/api/schema.d.ts';
import { summariseChampions, summaryCaption } from '#lib/domain/champion-summary.ts';
import { toMatchRows } from '#lib/domain/matches.ts';
import { MATCHES_PATH, fixtureBody, recordedNames } from './fixtures.ts';

type MatchSummary = components['schemas']['MatchSummary'];
const { matches } = fixtureBody(MATCHES_PATH) as { matches: MatchSummary[] };
const rows = toMatchRows(matches, recordedNames(), 0);

describe('summariseChampions', () => {
	it('groups the recorded page by champion, most played first', () => {
		const summary = summariseChampions(rows);
		expect(summary.map((c) => [c.name, c.games])).toEqual([
			['Viego', 6],
			['Shyvana', 2],
			['Ahri', 1],
			['Rakan', 1]
		]);
		expect(summary[0]).toEqual({
			id: 234,
			key: 'Viego',
			name: 'Viego',
			games: 6,
			wins: 4,
			losses: 2,
			winRate: 67,
			kills: '12.2',
			deaths: '4.7',
			assists: '4.3',
			kda: '3.54',
			csPerMinute: '7.1'
		});
	});

	it('leaves remakes out', () => {
		const remade = rows.map((r) =>
			r.champion.name === 'Ahri' ? { ...r, result: 'remake' as const } : r
		);
		expect(summariseChampions(remade).map((c) => c.name)).not.toContain('Ahri');
	});

	it('orders ties by wins, then by name', () => {
		const [ahri, rakan] = [
			rows.find((r) => r.champion.name === 'Ahri'),
			rows.find((r) => r.champion.name === 'Rakan')
		];
		if (!ahri || !rakan) throw new Error('fixture changed');
		expect(summariseChampions([rakan, ahri]).map((c) => c.name)).toEqual(['Ahri', 'Rakan']);
		expect(summariseChampions([{ ...rakan, result: 'win' }, ahri]).map((c) => c.name)).toEqual([
			'Ahri',
			'Rakan'
		]);
	});

	it('says how many matches it covers, and the remakes it leaves out', () => {
		const [first] = rows;
		const remake = { ...first, result: 'remake' as const };
		expect(summaryCaption(summariseChampions([first]), 1)).toBe('From the 1 match shown');
		expect(summaryCaption(summariseChampions([first, remake]), 2)).toBe(
			'From the 1 match shown, leaving out 1 remake'
		);
		expect(summaryCaption(summariseChampions([remake, remake]), 2)).toBe(
			'From the 0 matches shown, leaving out 2 remakes'
		);
	});

	it('handles no games and unknown durations', () => {
		expect(summariseChampions([])).toEqual([]);
		const [first] = rows;
		expect(summariseChampions([{ ...first, duration: null }])[0].csPerMinute).toBe('–');
	});
});
