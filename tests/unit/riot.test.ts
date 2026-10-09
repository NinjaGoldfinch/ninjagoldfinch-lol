import { describe, expect, it } from 'vitest';
import { parseAccount } from '#lib/api/riot.ts';
import { findFixture, loadFixtures } from '../mock-proxy/mock.ts';

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
