import { describe, expect, it } from 'vitest';
import { parseMatch, parseTimeline, type Match, type Timeline } from '#lib/api/match.ts';
import {
	formatMatchDate,
	isMatchIdFor,
	matchPath,
	matchTab,
	openBuildId,
	selectBuild,
	teamGold,
	toMatchDetail
} from '#lib/domain/match-detail.ts';
import { findRegion, type Region } from '#lib/domain/regions.ts';
import { MATCH_PATH, TIMELINE_PATH, fixtureBody, recordedNames } from './fixtures.ts';

const oce = findRegion('oce') as Region;
const names = recordedNames();
const rawTimeline = fixtureBody(TIMELINE_PATH) as {
	info: {
		frames: { timestamp: number; participantFrames: Record<string, { totalGold: number }> }[];
	};
};
const match = parseMatch(fixtureBody(MATCH_PATH)) as Match;
const timeline = parseTimeline(rawTimeline) as Timeline;
const detail = toMatchDetail(match, names, { region: oce, ddragonVersion: '16.20.1', timeline });

describe('toMatchDetail', () => {
	it('describes the game', () => {
		expect(detail).toMatchObject({
			matchId: 'OC1_712351051',
			region: { slug: 'oce', label: 'Oceania' },
			queueId: 420,
			queue: 'Ranked Solo',
			startedAt: match.gameCreation,
			duration: 1952,
			patch: '16.20',
			ddragonVersion: '16.20.1'
		});
	});

	it('makes one scoreboard per team, players in Riot order', () => {
		expect(detail.teams.map((t) => [t.name, t.result])).toEqual([
			['Blue team', 'loss'],
			['Red team', 'win']
		]);
		expect(detail.teams[1].players.map((p) => p.champion.name)).toEqual([
			'Volibear',
			'Zyra',
			'Ahri',
			"Kai'Sa",
			'Bard'
		]);
	});

	it("totals each team's kills, deaths, assists and gold from its players", () => {
		for (const team of detail.teams) {
			const players = match.participants.filter((p) => p.teamId === team.teamId);
			const sum = (key: 'kills' | 'deaths' | 'assists' | 'goldEarned') =>
				players.reduce((n, p) => n + p[key], 0);
			expect(team.kills).toBe(sum('kills'));
			expect(team.deaths).toBe(sum('deaths'));
			expect(team.assists).toBe(sum('assists'));
			expect(team.gold).toBe(sum('goldEarned'));
		}
		// Riot's own champion-kill objective count agrees.
		expect(detail.teams.map((t) => t.kills)).toEqual([28, 44]);
	});

	it('names the bans and keeps the objectives', () => {
		expect(detail.teams[0].bans[0]).toEqual({ id: 111, key: 'Nautilus', name: 'Nautilus' });
		expect(detail.teams[1].objectives).toEqual({
			tower: 8,
			inhibitor: 1,
			dragon: 4,
			baron: 1,
			riftHerald: 1,
			horde: 0
		});
	});

	it("shapes each player's line", () => {
		expect(detail.teams[1].players[2]).toEqual({
			participantId: 8,
			riotId: { gameName: 'NinjaGoldfinch', tagLine: 'OCENZ' },
			champion: { id: 103, key: 'Ahri', name: 'Ahri', level: 16 },
			position: 'MIDDLE',
			kills: 8,
			deaths: 8,
			assists: 10,
			cs: 181,
			gold: 12266,
			damage: 28294,
			vision: 24,
			items: [1056, 2503, 3100, 3171, 8010, 1052, 3363].map((id) => ({
				id,
				name: names.items[id]
			})),
			spells: [names.spells[14], names.spells[4]],
			runes: { keystone: names.runes[8992], secondary: names.runes[8000] }
		});
		expect(names.runes[8992].name).toBe('Deathfire Touch');
		// A bot laner keeps the role quest slot (their boots); others do not.
		const ezreal = detail.teams[0].players[3];
		expect(ezreal.roleBoundItem).toEqual({ id: 3158, name: 'Ionian Boots of Lucidity' });
		expect('roleBoundItem' in detail.teams[1].players[2]).toBe(false);
	});

	it('marks every team as a remake after an early surrender', () => {
		const remade = {
			...match,
			participants: match.participants.map((p) => ({ ...p, gameEndedInEarlySurrender: true }))
		};
		const view = toMatchDetail(remade, names, { region: oce, ddragonVersion: '16.20.1' });
		expect(view.teams.map((t) => t.result)).toEqual(['remake', 'remake']);
		expect(view.gold).toBeNull();
		expect(view.objectives).toBeNull();
	});
});

describe('teamGold', () => {
	it("sums each team's gold at every frame of the recorded timeline", () => {
		expect(detail.gold).toHaveLength(rawTimeline.info.frames.length);
		rawTimeline.info.frames.forEach((frame, i) => {
			const gold = (ids: number[]) =>
				ids.reduce((n, id) => n + frame.participantFrames[String(id)].totalGold, 0);
			expect(detail.gold?.[i]).toEqual({
				at: Math.round(frame.timestamp / 1000),
				teamGold: [gold([1, 2, 3, 4, 5]), gold([6, 7, 8, 9, 10])]
			});
		});
	});

	it('follows the order of the teams it is given', () => {
		const [frame] = teamGold(timeline, match, [200, 100]).slice(-1);
		const [last] = (detail.gold ?? []).slice(-1);
		expect(frame.teamGold).toEqual([last.teamGold[1], last.teamGold[0]]);
	});
});

describe('openBuildId', () => {
	it('follows ?build= until the visitor opens or closes a popup', () => {
		expect(openBuildId(undefined, '8')).toBe('8');
		expect(openBuildId(undefined, null)).toBeNull();
	});

	it('then follows what they did', () => {
		expect(openBuildId(9, null)).toBe('9');
		expect(openBuildId(9, '8')).toBe('9');
		expect(openBuildId(null, '8')).toBeNull();
	});
});

describe('selectBuild', () => {
	const me = { gameName: 'ninjagoldfinch', tagLine: 'OCENZ' };

	it('shows the first player (Blue top) by default', () => {
		expect(selectBuild(detail, null, null)?.participantId).toBe(1);
		expect(detail.teams[0].players[0].position).toBe('TOP');
	});

	it("shows the highlighted player's build", () => {
		expect(selectBuild(detail, null, me)?.participantId).toBe(8);
	});

	it('shows the player `build` names, over the highlighted one', () => {
		expect(selectBuild(detail, '4', me)?.participantId).toBe(4);
		expect(selectBuild(detail, '11', me)?.participantId).toBe(8);
		expect(selectBuild(detail, 'x', null)?.participantId).toBe(1);
	});
});

describe('isMatchIdFor', () => {
	it("accepts only a match id naming the region's platform", () => {
		expect(isMatchIdFor(oce, 'OC1_712351051')).toBe(true);
		expect(isMatchIdFor(findRegion('kr') as Region, 'KR_7123')).toBe(true);
		expect(isMatchIdFor(oce, 'EUW1_712351051')).toBe(false);
		expect(isMatchIdFor(oce, 'oc1_712351051')).toBe(false);
		expect(isMatchIdFor(oce, 'OC1_')).toBe(false);
		expect(isMatchIdFor(oce, '../OC1_1')).toBe(false);
	});
});

describe('matchPath', () => {
	it('builds the match page URL', () => {
		expect(matchPath('oce', 'OC1_712351051')).toBe('/match/oce/OC1_712351051');
	});

	it('names the player to highlight as in profile URLs', () => {
		expect(
			matchPath('oce', 'OC1_1', { player: { gameName: 'NinjaGoldfinch', tagLine: 'OCENZ' } })
		).toBe('/match/oce/OC1_1?player=NinjaGoldfinch-OCENZ');
		expect(matchPath('kr', 'KR_1', { player: { gameName: 'Hide on bush', tagLine: 'KR1' } })).toBe(
			'/match/kr/KR_1?player=Hide+on+bush-KR1'
		);
	});
});

describe('matchPath tabs', () => {
	it('names the tab, leaving out the default scoreboard', () => {
		expect(matchPath('oce', 'OC1_1', { tab: 'timeline' })).toBe('/match/oce/OC1_1?tab=timeline');
		expect(matchPath('oce', 'OC1_1', { tab: 'scoreboard' })).toBe('/match/oce/OC1_1');
		expect(
			matchPath('oce', 'OC1_1', {
				player: { gameName: 'NinjaGoldfinch', tagLine: 'OCENZ' },
				tab: 'timeline',
				build: 8
			})
		).toBe('/match/oce/OC1_1?player=NinjaGoldfinch-OCENZ&tab=timeline&build=8');
	});
});

describe('matchTab', () => {
	it('reads ?tab=, anything else being the scoreboard', () => {
		expect(matchTab('timeline')).toBe('timeline');
		expect(matchTab('scoreboard')).toBe('scoreboard');
		expect(matchTab(null)).toBe('scoreboard');
		expect(matchTab('Timeline')).toBe('scoreboard');
		expect(matchTab('constructor')).toBe('scoreboard');
	});
});

describe('formatMatchDate', () => {
	it('writes the start time in UTC', () => {
		expect(formatMatchDate(Date.UTC(2026, 9, 9, 4, 11, 30))).toBe('9 Oct 2026, 04:11 UTC');
	});
});
