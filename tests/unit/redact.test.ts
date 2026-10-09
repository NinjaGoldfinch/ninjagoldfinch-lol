import { describe, expect, it } from 'vitest';
import { createRedactor } from '../redact.ts';

describe('createRedactor', () => {
	it("replaces Riot's player ids with stable placeholders", () => {
		const { redact, placeholders } = createRedactor();
		const body = {
			metadata: { matchId: 'OC1_1', participants: ['real-puuid-a', 'real-puuid-b'] },
			info: {
				participants: [{ participantId: 1, puuid: 'real-puuid-a', summonerId: 'real-summoner' }]
			}
		};
		const out = JSON.stringify(redact(body));

		expect(out).not.toMatch(/real-/);
		const { metadata, info } = JSON.parse(out);
		expect(metadata.matchId).toBe('OC1_1');
		expect(metadata.participants[0]).toMatch(/^fixture-puuid-[0-9a-f]{16}$/);
		// The same puuid gets the same placeholder wherever it appears.
		expect(info.participants[0].puuid).toBe(metadata.participants[0]);
		expect(info.participants[0].summonerId).toMatch(/^fixture-summoner-[0-9a-f]{16}$/);
		expect(placeholders.get('real-puuid-b')).toBe(metadata.participants[1]);
	});

	it('leaves other participant lists alone', () => {
		const { redact } = createRedactor();
		const body = { info: { participants: [{ participantId: 1 }] }, participants: ['kept'] };
		expect(redact(body)).toEqual(body);
	});
});
