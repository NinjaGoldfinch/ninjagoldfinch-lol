import { describe, expect, it } from 'vitest';
import type { components } from '#lib/api/schema.d.ts';
import { toLeagueEntries, toSummoner } from '#lib/api/riot.ts';
import { PROFILE_PATH, fixtureBody } from './fixtures.ts';

const profile = fixtureBody(PROFILE_PATH) as components['schemas']['ProfileBody'];

describe('toSummoner', () => {
	it('keeps the fields the profile shows', () => {
		expect(toSummoner(profile.summoner)).toEqual({ profileIconId: 7173, summonerLevel: 458 });
	});

	it('passes a failed part through as null', () => {
		expect(toSummoner(null)).toBeNull();
	});
});

describe('toLeagueEntries', () => {
	it('keeps the fields the profile shows', () => {
		expect(toLeagueEntries(profile.league)).toEqual([
			{
				queueType: 'RANKED_SOLO_5x5',
				tier: 'EMERALD',
				rank: 'III',
				leaguePoints: 67,
				wins: 475,
				losses: 464
			}
		]);
	});

	it('keeps unranked (empty) apart from a failed part (null)', () => {
		expect(toLeagueEntries([])).toEqual([]);
		expect(toLeagueEntries(null)).toBeNull();
	});
});
