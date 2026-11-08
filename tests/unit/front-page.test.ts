import { describe, expect, it } from 'vitest';
import { toChampionTable } from '#lib/domain/champion-stats.ts';
import {
	EXAMPLE_SEARCHES,
	TOP_WIN_RATE_MIN_GAMES,
	formatCount,
	topWinRates,
	winRateBar
} from '#lib/domain/front-page.ts';
import type { components } from '#lib/api/schema.d.ts';
import { fixtureBody, recordedNames } from './fixtures.ts';

type ChampionStatsResponse = components['schemas']['ChampionStatsResponse'];

const ANALYTICS_PATH =
	'/v1/lol/analytics/champions?queue=RANKED_SOLO_5x5&patch=all&minGames=0&limit=500';

function recordedTable() {
	// The recorded body, as the typed client hands it over.
	const body = fixtureBody(ANALYTICS_PATH) as ChampionStatsResponse;
	return toChampionTable(body, recordedNames());
}

describe('topWinRates', () => {
	it('lists the six highest win rates over 800 games, highest first', () => {
		const rows = topWinRates(recordedTable());
		expect(rows.map((r) => r.name)).toEqual([
			'Taliyah',
			'Gragas',
			'Riven',
			'Janna',
			"Vel'Koz",
			'Nocturne'
		]);
		expect(rows.every((r) => r.games >= TOP_WIN_RATE_MIN_GAMES)).toBe(true);
		const rates = rows.map((r) => r.winRate);
		expect(rates).toEqual(rates.toSorted((a, b) => b - a));
	});

	it('leaves out every champion under the floor', () => {
		expect(topWinRates(recordedTable(), 10_000_000)).toEqual([]);
	});

	it('lists as many as asked', () => {
		expect(topWinRates(recordedTable(), 800, 2).map((r) => r.name)).toEqual(['Taliyah', 'Gragas']);
	});
});

describe('winRateBar', () => {
	it('runs from 0 at 45 % to 100 at 60 %, in whole percent', () => {
		expect(winRateBar(0.45)).toBe(0);
		expect(winRateBar(0.525)).toBe(50);
		expect(winRateBar(0.6)).toBe(100);
	});

	it('stays within the bar', () => {
		expect(winRateBar(0.3)).toBe(0);
		expect(winRateBar(0.9)).toBe(100);
	});
});

describe('formatCount', () => {
	it('groups thousands with commas', () => {
		expect(formatCount(211590)).toBe('211,590');
		expect(formatCount(12)).toBe('12');
	});
});

describe('EXAMPLE_SEARCHES', () => {
	it('links two champion pages and a profile', () => {
		expect(EXAMPLE_SEARCHES.map((e) => e.href)).toEqual([
			'/champions/ahri',
			'/champions/jinx',
			'/summoner/NinjaGoldfinch-OCENZ'
		]);
	});
});
