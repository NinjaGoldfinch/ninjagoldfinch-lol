import { describe, expect, it } from 'vitest';
import {
	parseRiotId,
	parseRiotIdInput,
	profilePath,
	riotIdKey,
	sameRiotId
} from '#lib/domain/riot-id.ts';

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

	// Dots are not encoded in a riot-proxy path: `..` would reach another route.
	it('rejects a name or tag of . or ..', () => {
		expect(parseRiotId('..-x')).toBeUndefined();
		expect(parseRiotId('.-x')).toBeUndefined();
		expect(parseRiotId('x-..')).toBeUndefined();
		expect(parseRiotIdInput('.. #x')).toBeUndefined();
		expect(parseRiotId('...-x')).toEqual({ gameName: '...', tagLine: 'x' });
	});

	it("holds the parts to the spec's lengths, in characters", () => {
		expect(parseRiotId(`${'a'.repeat(16)}-12345`)).toEqual({
			gameName: 'a'.repeat(16),
			tagLine: '12345'
		});
		expect(parseRiotId(`${'a'.repeat(17)}-OCE`)).toBeUndefined();
		expect(parseRiotId('Name-123456')).toBeUndefined();
		expect(parseRiotId(`${'ñ'.repeat(16)}-OCE`)).toEqual({
			gameName: 'ñ'.repeat(16),
			tagLine: 'OCE'
		});
	});
});

describe('profilePath', () => {
	it('URL-encodes the Riot ID as Name-TAG', () => {
		expect(profilePath({ gameName: 'Hide on bush', tagLine: 'KR1' })).toBe(
			'/summoner/Hide%20on%20bush-KR1'
		);
	});

	it('round-trips through parseRiotId', () => {
		const id = { gameName: 'Some-Name ñ', tagLine: 'OCE' };
		const segment = decodeURIComponent(profilePath(id).split('/').at(-1) ?? '');
		expect(parseRiotId(segment)).toEqual(id);
	});
});

describe('sameRiotId', () => {
	it('compares game name and tag line without regard to case', () => {
		const me = { gameName: 'NinjaGoldfinch', tagLine: 'OCENZ' };
		expect(sameRiotId(me, { gameName: 'ninjagoldfinch', tagLine: 'ocenz' })).toBe(true);
		expect(sameRiotId(me, { gameName: 'NinjaGoldfinch', tagLine: 'OCE' })).toBe(false);
		expect(sameRiotId(me, { gameName: 'Ninja', tagLine: 'GoldfinchOCENZ' })).toBe(false);
	});
});

describe('riotIdKey', () => {
	it('is name#tag in lower case', () => {
		expect(riotIdKey({ gameName: 'NinjaGoldfinch', tagLine: 'OCENZ' })).toBe(
			'ninjagoldfinch#ocenz'
		);
	});
});
