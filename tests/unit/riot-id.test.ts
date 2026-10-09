import { describe, expect, it } from 'vitest';
import { parseRiotId, parseRiotIdInput, profilePath } from '#lib/domain/riot-id.ts';

describe('parseRiotIdInput', () => {
	it('splits Name#TAG and trims both parts', () => {
		expect(parseRiotIdInput('Hide on bush#KR1')).toEqual({
			gameName: 'Hide on bush',
			tagLine: 'KR1'
		});
		expect(parseRiotIdInput('  Hide on bush #KR1 ')).toEqual({
			gameName: 'Hide on bush',
			tagLine: 'KR1'
		});
	});

	it('rejects input without a tag or a name', () => {
		expect(parseRiotIdInput('Hide on bush')).toBeUndefined();
		expect(parseRiotIdInput('Hide on bush#')).toBeUndefined();
		expect(parseRiotIdInput('#KR1')).toBeUndefined();
		expect(parseRiotIdInput('')).toBeUndefined();
	});
});

describe('parseRiotId', () => {
	it('splits the URL segment on the last hyphen', () => {
		expect(parseRiotId('Hide on bush-KR1')).toEqual({ gameName: 'Hide on bush', tagLine: 'KR1' });
		expect(parseRiotId('Some-Name-OCE')).toEqual({ gameName: 'Some-Name', tagLine: 'OCE' });
	});

	it('rejects a segment without a hyphen', () => {
		expect(parseRiotId('Hideonbush')).toBeUndefined();
	});
});

describe('profilePath', () => {
	it('URL-encodes the Riot ID as Name-TAG', () => {
		expect(profilePath('kr', { gameName: 'Hide on bush', tagLine: 'KR1' })).toBe(
			'/summoner/kr/Hide%20on%20bush-KR1'
		);
	});

	it('round-trips through parseRiotId', () => {
		const id = { gameName: 'Some-Name ñ', tagLine: 'OCE' };
		const segment = decodeURIComponent(profilePath('oce', id).split('/').at(-1) ?? '');
		expect(parseRiotId(segment)).toEqual(id);
	});
});
