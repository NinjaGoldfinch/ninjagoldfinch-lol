import { describe, expect, it } from 'vitest';
import { parseAccount, parseLeagueEntries, parseSummoner } from '#lib/api/riot.ts';
import { findFixture, loadFixtures } from '../mock-proxy/mock.ts';
import { PROFILE_PATH, fixtureBody } from './fixtures.ts';

describe('parseAccount', () => {
	it('accepts the recorded account payload', () => {
		const fixture = findFixture(
			loadFixtures(),
			'GET',
			'/v1/riot/accounts/by-riot-id/asia/Hide%20on%20bush/KR1'
		);
		expect(parseAccount(fixture?.response.body)).toMatchObject({
			gameName: 'Hide on bush',
			tagLine: 'KR1'
		});
	});

	it('accepts an account without gameName and tagLine, which Riot documents as optional', () => {
		expect(parseAccount({ puuid: 'p' })).toEqual({ puuid: 'p' });
	});

	it('rejects payloads of the wrong shape', () => {
		expect(parseAccount(null)).toBeUndefined();
		expect(parseAccount('account')).toBeUndefined();
		expect(parseAccount({ gameName: 'x' })).toBeUndefined();
		expect(parseAccount({ puuid: 'p', tagLine: 1 })).toBeUndefined();
	});
});

describe('parseSummoner', () => {
	it('reads the recorded summoner part', () => {
		const { summoner } = fixtureBody(PROFILE_PATH) as { summoner: unknown };
		expect(parseSummoner(summoner)).toEqual({ profileIconId: 7173, summonerLevel: 458 });
	});

	it('rejects a missing or malformed part', () => {
		expect(parseSummoner(null)).toBeUndefined();
		expect(parseSummoner({ profileIconId: 1 })).toBeUndefined();
	});
});

describe('parseLeagueEntries', () => {
	it('reads the recorded league part', () => {
		const { league } = fixtureBody(PROFILE_PATH) as { league: unknown };
		expect(parseLeagueEntries(league)).toEqual([
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

	it('treats an empty list as unranked and a failed part as unknown', () => {
		expect(parseLeagueEntries([])).toEqual([]);
		expect(parseLeagueEntries(null)).toBeUndefined();
	});

	it('drops entries of the wrong shape', () => {
		expect(parseLeagueEntries([{ queueType: 'RANKED_FLEX_SR' }, 3])).toEqual([]);
	});
});
