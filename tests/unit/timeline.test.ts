import { describe, expect, it } from 'vitest';
import {
	OBJECTIVES,
	parseMatch,
	parseTimeline,
	type BuildingKillEvent,
	type Match,
	type MonsterKillEvent,
	type Timeline
} from '#lib/api/match.ts';
import { teamGold } from '#lib/domain/match-detail.ts';
import {
	formatLead,
	goldAxis,
	goldLead,
	largestLeads,
	leadPaths,
	markerRows,
	minuteTicks,
	nearestFrame,
	objectiveKills,
	objectiveMarkers,
	type ObjectiveKill
} from '#lib/domain/timeline.ts';
import { MATCH_PATH, TIMELINE_PATH, fixtureBody } from './fixtures.ts';

// The raw recorded payloads, read without the site's parsers, to check the
// charts' numbers against.
const rawMatch = fixtureBody(MATCH_PATH) as {
	info: { teams: { teamId: number; objectives: Record<string, { kills: number }> }[] };
};
const rawTimeline = fixtureBody(TIMELINE_PATH) as {
	info: {
		frames: { timestamp: number; participantFrames: Record<string, { totalGold: number }> }[];
	};
};
const match = parseMatch(fixtureBody(MATCH_PATH)) as Match;
const timeline = parseTimeline(rawTimeline) as Timeline;
const kills = objectiveKills(timeline.objectives, [100, 200]);
const lead = goldLead(teamGold(timeline, match, [100, 200]));

const monster = (at: number, team: number, type: string, sub?: string): MonsterKillEvent => ({
	type: 'ELITE_MONSTER_KILL',
	timestamp: at * 1000,
	killerTeamId: team,
	monsterType: type,
	monsterSubType: sub ?? null
});
const building = (
	at: number,
	lost: number,
	buildingType: string,
	laneType: string | null,
	towerType: string | null = null
): BuildingKillEvent => ({
	type: 'BUILDING_KILL',
	timestamp: at * 1000,
	teamId: lost,
	buildingType,
	laneType,
	towerType
});

describe('objectiveKills', () => {
	it("matches each team's objective counts on the recorded match's scoreboard", () => {
		for (const team of rawMatch.info.teams) {
			for (const kind of OBJECTIVES) {
				const taken = kills.filter((k) => k.teamId === team.teamId && k.kind === kind);
				expect(taken.length, `${team.teamId} ${kind}`).toBe(team.objectives[kind].kills);
			}
		}
		expect(kills).toHaveLength(24);
	});

	it('names each kill and gives its time in seconds', () => {
		expect(kills.slice(0, 5)).toEqual([
			{ at: 525, teamId: 100, kind: 'horde', name: 'Voidgrub' },
			{ at: 538, teamId: 100, kind: 'horde', name: 'Voidgrub' },
			{ at: 541, teamId: 100, kind: 'horde', name: 'Voidgrub' },
			{ at: 555, teamId: 200, kind: 'dragon', name: 'Hextech Drake' },
			// Red's top outer tower fell, so Blue took it.
			{ at: 823, teamId: 100, kind: 'tower', name: 'Top outer tower' }
		]);
		expect(kills.filter((k) => k.kind === 'dragon').map((k) => k.name)).toEqual([
			'Hextech Drake',
			'Cloud Drake',
			'Chemtech Drake',
			'Chemtech Drake'
		]);
		expect(kills.find((k) => k.kind === 'inhibitor')).toEqual({
			at: 1759,
			teamId: 200,
			kind: 'inhibitor',
			name: 'Mid inhibitor'
		});
		expect(kills.slice(-2).map((k) => k.name)).toEqual(['Nexus tower', 'Nexus tower']);
	});

	it('names the other kills Riot records', () => {
		const named = objectiveKills(
			[
				monster(1, 100, 'DRAGON', 'ELDER_DRAGON'),
				monster(2, 100, 'DRAGON', 'SOMETHING_NEW'),
				monster(3, 100, 'BARON_NASHOR'),
				monster(4, 100, 'RIFTHERALD'),
				building(5, 200, 'TOWER_BUILDING', 'BOT_LANE', 'BASE_TURRET'),
				building(6, 200, 'TOWER_BUILDING', null, 'SOMETHING_NEW'),
				building(7, 200, 'INHIBITOR_BUILDING', null)
			],
			[100, 200]
		);
		expect(named.map((k) => k.name)).toEqual([
			'Elder Dragon',
			'Dragon',
			'Baron Nashor',
			'Rift Herald',
			'Bot base tower',
			'Tower',
			'Inhibitor'
		]);
	});

	it("drops what it can't credit or doesn't count", () => {
		expect(
			objectiveKills(
				[
					monster(1, 100, 'ATAKHAN'),
					monster(2, 300, 'DRAGON', 'FIRE_DRAGON'),
					building(3, 300, 'TOWER_BUILDING', 'TOP_LANE', 'OUTER_TURRET'),
					building(4, 200, 'SOMETHING_NEW', 'TOP_LANE')
				],
				[100, 200]
			)
		).toEqual([]);
		// With other than two teams, the team that took a building is unknown.
		expect(
			objectiveKills([building(1, 200, 'TOWER_BUILDING', 'TOP_LANE', 'OUTER_TURRET')], [200])
		).toEqual([]);
	});
});

describe('objectiveMarkers', () => {
	const kill = (at: number, teamId: number, kind: ObjectiveKill['kind'], name = kind) => ({
		at,
		teamId,
		kind,
		name
	});

	it("groups one team's kills of one kind within a minute of the first", () => {
		const markers = objectiveMarkers(kills);
		expect(markers[0]).toEqual({
			at: 525,
			teamId: 100,
			kind: 'horde',
			names: ['Voidgrub', 'Voidgrub', 'Voidgrub']
		});
		expect(markers.at(-1)).toEqual({
			at: 1934,
			teamId: 200,
			kind: 'tower',
			names: ['Nexus tower', 'Nexus tower']
		});
	});

	it('keeps kinds, teams and kills more than a minute apart separate', () => {
		const markers = objectiveMarkers([
			kill(100, 100, 'tower'),
			kill(110, 200, 'tower'),
			kill(120, 100, 'dragon'),
			kill(150, 100, 'tower'),
			kill(161, 100, 'tower'),
			kill(300, 100, 'tower')
		]);
		expect(markers.map((m) => [m.at, m.teamId, m.kind, m.names.length])).toEqual([
			[100, 100, 'tower', 2],
			[110, 200, 'tower', 1],
			[120, 100, 'dragon', 1],
			[161, 100, 'tower', 1],
			[300, 100, 'tower', 1]
		]);
	});
});

describe('markerRows', () => {
	it('stacks markers closer than the gap, reusing the first clear row', () => {
		expect(markerRows([0, 50, 90, 100, 150, 400], 100)).toEqual([0, 1, 2, 0, 1, 0]);
		expect(markerRows([], 100)).toEqual([]);
	});
});

describe('goldLead', () => {
	it("is Blue's gold minus Red's at every frame of the recorded timeline", () => {
		expect(lead).toHaveLength(rawTimeline.info.frames.length);
		rawTimeline.info.frames.forEach((frame, i) => {
			const gold = (ids: number[]) =>
				ids.reduce((n, id) => n + frame.participantFrames[String(id)].totalGold, 0);
			expect(lead[i]).toEqual({
				at: Math.round(frame.timestamp / 1000),
				lead: gold([1, 2, 3, 4, 5]) - gold([6, 7, 8, 9, 10])
			});
		});
	});

	it('is empty unless there are two teams', () => {
		expect(goldLead([{ at: 0, teamGold: [500] }])).toEqual([]);
	});
});

describe('largestLeads', () => {
	it("finds each side's largest lead in the recorded timeline", () => {
		expect(largestLeads(lead)).toEqual({
			first: { at: 420, lead: 716 },
			second: { at: 1952, lead: -8153 }
		});
	});

	it('is null for a side that never led', () => {
		expect(
			largestLeads([
				{ at: 0, lead: 0 },
				{ at: 60, lead: 200 }
			])
		).toEqual({ first: { at: 60, lead: 200 }, second: null });
	});
});

describe('goldAxis', () => {
	const leads = (...values: number[]) => values.map((v, i) => ({ at: i * 60, lead: v }));

	it('picks the smallest round step that fits the largest lead in three', () => {
		expect(goldAxis(leads(0))).toEqual({ limit: 1000, step: 1000 });
		expect(goldAxis(leads(-2500, 300))).toEqual({ limit: 3000, step: 1000 });
		expect(goldAxis(leads(3001))).toEqual({ limit: 4000, step: 2000 });
		expect(goldAxis(lead)).toEqual({ limit: 10000, step: 5000 });
		expect(goldAxis(leads(400000))).toEqual({ limit: 400000, step: 50000 });
	});
});

describe('nearestFrame', () => {
	const points = [
		{ at: 0, lead: 0 },
		{ at: 60, lead: 100 },
		{ at: 120, lead: -300 }
	];

	it('finds the frame closest in time, the earlier one on a tie', () => {
		expect(nearestFrame(points, 10)).toBe(0);
		expect(nearestFrame(points, 30)).toBe(0);
		expect(nearestFrame(points, 31)).toBe(1);
		expect(nearestFrame(points, 500)).toBe(2);
		expect(nearestFrame(points, -20)).toBe(0);
	});

	it('is -1 without points', () => {
		expect(nearestFrame([], 10)).toBe(-1);
	});
});

describe('minuteTicks', () => {
	it('marks every 5 minutes, or every 10 in a long game', () => {
		expect(minuteTicks(1952)).toEqual([0, 5, 10, 15, 20, 25, 30]);
		expect(minuteTicks(50 * 60)).toEqual([0, 10, 20, 30, 40, 50]);
		expect(minuteTicks(0)).toEqual([0]);
	});
});

describe('leadPaths', () => {
	it('draws the lead with zero across the middle, and closes the area on it', () => {
		const points = [
			{ at: 0, lead: 0 },
			{ at: 60, lead: 1000 },
			{ at: 120, lead: -2000 }
		];
		expect(leadPaths(points, { width: 120, height: 100, duration: 120, limit: 1000 })).toEqual({
			// -2000 is past the limit, so it is drawn at the bottom edge.
			line: 'M0 50 L60 0 L120 100',
			area: 'M0 50 L60 0 L120 100 L120 50 L0 50 Z'
		});
	});

	it('draws nothing without points or axes', () => {
		const empty = { line: '', area: '' };
		const box = { width: 100, height: 100, duration: 60, limit: 1000 };
		expect(leadPaths([], box)).toEqual(empty);
		expect(leadPaths([{ at: 0, lead: 0 }], { ...box, duration: 0 })).toEqual(empty);
	});
});

describe('formatLead', () => {
	it('writes thousands as k, with a sign', () => {
		expect(formatLead(10000)).toBe('+10k');
		expect(formatLead(-5000)).toBe('−5k');
		expect(formatLead(3250)).toBe('+3.3k');
		expect(formatLead(-800)).toBe('−800');
		expect(formatLead(0)).toBe('0');
	});
});
