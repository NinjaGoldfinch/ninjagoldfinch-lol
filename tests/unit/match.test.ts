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

	it('reads the whole rune page', () => {
		expect(parseMatch(raw)?.participants[7].runePage).toEqual({
			primary: { style: 8200, perks: [8992, 8226, 8210, 8237] },
			secondary: { style: 8000, perks: [9105, 8017] },
			shards: [5005, 5008, 5001]
		});
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

	it('reads the item and skill events, in game order', () => {
		const timeline = parseTimeline(fixtureBody(TIMELINE_PATH));
		const types = timeline?.events.map((e) => e.type);
		expect(types?.filter((t) => t === 'ITEM_PURCHASED')).toHaveLength(255);
		expect(types?.filter((t) => t === 'ITEM_SOLD')).toHaveLength(11);
		expect(types?.filter((t) => t === 'ITEM_UNDO')).toHaveLength(16);
		expect(types?.filter((t) => t === 'SKILL_LEVEL_UP')).toHaveLength(164);
		expect(timeline?.events.find((e) => e.type === 'SKILL_LEVEL_UP')).toEqual({
			type: 'SKILL_LEVEL_UP',
			participantId: 2,
			timestamp: 1805,
			skillSlot: 3,
			levelUpType: 'NORMAL'
		});
		const stamps = timeline?.events.map((e) => e.timestamp) ?? [];
		expect(stamps).toEqual([...stamps].sort((a, b) => a - b));
	});

	it('drops events missing a field it reads, and the kinds it does not', () => {
		const body = {
			metadata: { matchId: 'OC1_1' },
			info: {
				frames: [
					{
						timestamp: 0,
						participantFrames: {},
						events: [
							{ type: 'ITEM_PURCHASED', participantId: 1, timestamp: 5 },
							{ type: 'SKILL_LEVEL_UP', participantId: 1, timestamp: 6, skillSlot: 9 },
							{ type: 'ITEM_UNDO', participantId: 1, timestamp: 7, beforeId: 0, afterId: 0 },
							{ type: 'WARD_PLACED', participantId: 1, timestamp: 8 },
							{ type: 'ITEM_SOLD', participantId: 1, timestamp: 9, itemId: 2031 }
						]
					}
				]
			}
		};
		expect(parseTimeline(body)?.events).toEqual([
			{ type: 'ITEM_SOLD', participantId: 1, timestamp: 9, itemId: 2031 }
		]);
	});

	it('rejects a payload without frames', () => {
		expect(parseTimeline({ metadata: { matchId: 'OC1_1' }, info: {} })).toBeUndefined();
		expect(parseTimeline('nope')).toBeUndefined();
	});
});
