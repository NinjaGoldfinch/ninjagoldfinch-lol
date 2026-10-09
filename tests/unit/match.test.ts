import { describe, expect, it } from 'vitest';
import { parseMatch, parseTimeline } from '#lib/api/match.ts';
import { MATCH_PATH, TIMELINE_PATH, fixtureBody } from './fixtures.ts';

const raw = fixtureBody(MATCH_PATH) as {
	info: { participants: Record<string, unknown>[]; teams: Record<string, unknown>[] };
};

describe('parseMatch', () => {
	it('reads the recorded match', () => {
		const match = parseMatch(raw);
		expect(match).toMatchObject({
			matchId: 'OC1_712351051',
			queueId: 420,
			gameDuration: 1952,
			gameVersion: '16.20.824.8524'
		});
		expect(match?.participants).toHaveLength(10);
		expect(match?.participants[7]).toMatchObject({
			participantId: 8,
			teamId: 200,
			riotIdGameName: 'NinjaGoldfinch',
			riotIdTagline: 'OCENZ',
			championId: 103,
			teamPosition: 'MIDDLE',
			kills: 8,
			deaths: 8,
			assists: 10,
			goldEarned: 12266,
			totalDamageDealtToChampions: 28294,
			roleBoundItem: 1206,
			win: true
		});
		expect(match?.teams[0]).toEqual({
			teamId: 100,
			win: false,
			bans: [111, 56, 876, 74, 800],
			objectives: { tower: 5, inhibitor: 0, dragon: 0, baron: 1, riftHerald: 0, horde: 3 }
		});
	});

	it('takes the keystone and the secondary path from the rune pages', () => {
		const top = parseMatch(raw)?.participants[0];
		expect(top?.perks).toEqual({ keystone: 8010, subStyle: 8400 });
	});

	it('drops empty bans and reads missing counts as zero', () => {
		const [first, ...rest] = raw.info.participants;
		const noKills = { ...first, kills: undefined };
		const body = {
			...raw,
			info: {
				...raw.info,
				participants: [noKills, ...rest],
				teams: [{ ...raw.info.teams[0], bans: [{ championId: -1 }, { championId: 111 }] }]
			}
		};
		const match = parseMatch(body);
		expect(match?.participants[0].kills).toBe(0);
		expect(match?.teams[0].bans).toEqual([111]);
	});

	it('rejects a payload without the match id or a usable player', () => {
		expect(parseMatch(null)).toBeUndefined();
		expect(parseMatch({ info: raw.info })).toBeUndefined();
		const noTeam = { ...raw.info.participants[0], teamId: undefined };
		expect(parseMatch({ ...raw, info: { ...raw.info, participants: [noTeam] } })).toBeUndefined();
		expect(parseMatch({ ...raw, info: { ...raw.info, participants: [] } })).toBeUndefined();
	});
});

describe('parseTimeline', () => {
	it("reads each frame's gold from the recorded timeline", () => {
		const timeline = parseTimeline(fixtureBody(TIMELINE_PATH));
		expect(timeline?.matchId).toBe('OC1_712351051');
		expect(timeline?.frames).toHaveLength(34);
		expect(timeline?.frames[0]).toEqual({
			timestamp: 0,
			totalGold: { 1: 500, 2: 500, 3: 500, 4: 500, 5: 500, 6: 500, 7: 500, 8: 500, 9: 500, 10: 500 }
		});
		expect(timeline?.frames.at(-1)?.timestamp).toBe(1952002);
	});

	it('rejects a payload without frames', () => {
		expect(parseTimeline({ metadata: { matchId: 'OC1_1' }, info: {} })).toBeUndefined();
		expect(parseTimeline('nope')).toBeUndefined();
	});
});
