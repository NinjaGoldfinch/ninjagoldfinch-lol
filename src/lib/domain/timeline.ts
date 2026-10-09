import type { Objective, ObjectiveEvent } from '#lib/api/match.ts';

/** Both teams' gold at one timeline frame, in the order of the match page's teams. */
export interface GoldFrame {
	/** Seconds from the start of the game. */
	at: number;
	teamGold: number[];
}

/** The first team's gold lead at one frame; negative when the second team leads. */
export interface GoldPoint {
	/** Seconds from the start of the game. */
	at: number;
	lead: number;
}

/** One objective taken, as the match page shows it. */
export interface ObjectiveKill {
	/** Seconds from the start of the game. */
	at: number;
	/** The team that took it. */
	teamId: number;
	kind: Objective;
	/** `Hextech Drake`, `Mid inner tower`, ... */
	name: string;
}

/** Objective kills close together in time, drawn as one marker. */
export interface ObjectiveMarker {
	/** The first kill's time, in seconds. */
	at: number;
	teamId: number;
	kind: Objective;
	/** Each kill's name, in game order. */
	names: string[];
}

const MONSTERS: Record<string, { kind: Objective; name: string }> = {
	DRAGON: { kind: 'dragon', name: 'Dragon' },
	BARON_NASHOR: { kind: 'baron', name: 'Baron Nashor' },
	RIFTHERALD: { kind: 'riftHerald', name: 'Rift Herald' },
	HORDE: { kind: 'horde', name: 'Voidgrub' }
};

/** Riot's in-game names for the dragons, by `monsterSubType`. */
const DRAGONS: Record<string, string> = {
	FIRE_DRAGON: 'Infernal Drake',
	WATER_DRAGON: 'Ocean Drake',
	EARTH_DRAGON: 'Mountain Drake',
	AIR_DRAGON: 'Cloud Drake',
	HEXTECH_DRAGON: 'Hextech Drake',
	CHEMTECH_DRAGON: 'Chemtech Drake',
	ELDER_DRAGON: 'Elder Dragon'
};

const LANE_NAMES: Record<string, string> = { TOP_LANE: 'Top', MID_LANE: 'Mid', BOT_LANE: 'Bot' };
const TOWER_TIERS: Record<string, string> = {
	OUTER_TURRET: 'outer',
	INNER_TURRET: 'inner',
	BASE_TURRET: 'base'
};

/**
 * The timeline's objective kills, credited to the team that took each one,
 * in game order. A building kill names the team that lost it, so it is
 * credited to the other team; with other than two teams it is dropped.
 * Monster types the site does not count on the scoreboard are dropped too.
 */
export function objectiveKills(events: ObjectiveEvent[], teamIds: number[]): ObjectiveKill[] {
	return events.flatMap((e): ObjectiveKill[] => {
		const at = Math.round(e.timestamp / 1000);
		if (e.type === 'ELITE_MONSTER_KILL') {
			const monster = MONSTERS[e.monsterType];
			if (!monster || !teamIds.includes(e.killerTeamId)) return [];
			const name =
				monster.kind === 'dragon'
					? (DRAGONS[e.monsterSubType ?? ''] ?? monster.name)
					: monster.name;
			return [{ at, teamId: e.killerTeamId, kind: monster.kind, name }];
		}

		const takenBy = teamIds.length === 2 ? teamIds.find((id) => id !== e.teamId) : undefined;
		if (takenBy === undefined || !teamIds.includes(e.teamId)) return [];
		const lane = LANE_NAMES[e.laneType ?? ''];
		if (e.buildingType === 'INHIBITOR_BUILDING') {
			return [
				{ at, teamId: takenBy, kind: 'inhibitor', name: lane ? `${lane} inhibitor` : 'Inhibitor' }
			];
		}
		if (e.buildingType !== 'TOWER_BUILDING') return [];
		const tier = TOWER_TIERS[e.towerType ?? ''];
		const name =
			e.towerType === 'NEXUS_TURRET'
				? 'Nexus tower'
				: lane && tier
					? `${lane} ${tier} tower`
					: 'Tower';
		return [{ at, teamId: takenBy, kind: 'tower', name }];
	});
}

/**
 * Groups kills of one kind by one team that start within `window` seconds of
 * the group's first, such as three voidgrubs or two nexus towers, so their
 * markers do not sit on top of each other.
 */
export function objectiveMarkers(kills: ObjectiveKill[], window = 60): ObjectiveMarker[] {
	const markers: ObjectiveMarker[] = [];
	for (const kill of kills) {
		const group = markers.findLast((m) => m.teamId === kill.teamId && m.kind === kill.kind);
		if (group && kill.at - group.at <= window) group.names.push(kill.name);
		else markers.push({ at: kill.at, teamId: kill.teamId, kind: kill.kind, names: [kill.name] });
	}
	return markers.sort((a, b) => a.at - b.at);
}

/**
 * A row for each of a lane's markers, given their times in order, so that
 * markers less than `gap` seconds apart never share a row. Each goes in the
 * first row that is clear of the one before it.
 */
export function markerRows(times: number[], gap: number): number[] {
	const lastInRow: number[] = [];
	return times.map((at) => {
		let row = lastInRow.findIndex((last) => at - last >= gap);
		if (row === -1) row = lastInRow.length;
		lastInRow[row] = at;
		return row;
	});
}

/** The first team's lead over the second at every frame; empty unless there are two teams. */
export function goldLead(frames: GoldFrame[]): GoldPoint[] {
	return frames.flatMap(({ at, teamGold }) =>
		teamGold.length === 2 ? [{ at, lead: teamGold[0] - teamGold[1] }] : []
	);
}

/** Each side's largest lead and when it was; null for a side that never led. */
export function largestLeads(points: GoldPoint[]): {
	first: GoldPoint | null;
	second: GoldPoint | null;
} {
	let first: GoldPoint | null = null;
	let second: GoldPoint | null = null;
	for (const p of points) {
		if (p.lead > 0 && (!first || p.lead > first.lead)) first = p;
		if (p.lead < 0 && (!second || p.lead < second.lead)) second = p;
	}
	return { first, second };
}

const GOLD_STEPS = [1000, 2000, 5000, 10000, 20000, 50000];

/**
 * The gold axis: `limit` either side of zero, with grid lines every `step`.
 * The step is the smallest round one that fits the largest lead in three.
 */
export function goldAxis(points: GoldPoint[]): { limit: number; step: number } {
	const largest = Math.max(0, ...points.map((p) => Math.abs(p.lead)));
	const step = GOLD_STEPS.find((s) => largest <= s * 3) ?? (GOLD_STEPS.at(-1) as number);
	return { limit: Math.max(1, Math.ceil(largest / step)) * step, step };
}

/**
 * The index of the point nearest `at` seconds, for pointing at the chart;
 * -1 without points. Points are in time order; a tie goes to the earlier one.
 */
export function nearestFrame(points: GoldPoint[], at: number): number {
	let best = -1;
	for (let i = 0; i < points.length; i++) {
		if (best === -1 || Math.abs(points[i].at - at) < Math.abs(points[best].at - at)) best = i;
	}
	return best;
}

/** Minute marks for the time axis: every 5 minutes, or every 10 past 45. */
export function minuteTicks(duration: number): number[] {
	const every = duration > 45 * 60 ? 10 : 5;
	const ticks: number[] = [];
	for (let m = 0; m * 60 <= duration; m += every) ticks.push(m);
	return ticks;
}

/**
 * SVG paths for the lead line and the area between it and zero, in a box
 * `width` × `height` with zero across the middle. `duration` and `limit` are
 * the axes' ends.
 */
export function leadPaths(
	points: GoldPoint[],
	{
		width,
		height,
		duration,
		limit
	}: { width: number; height: number; duration: number; limit: number }
): { line: string; area: string } {
	if (points.length === 0 || duration <= 0 || limit <= 0) return { line: '', area: '' };
	const mid = height / 2;
	const round = (n: number) => Math.round(n * 100) / 100;
	const xy = points.map((p) => [
		round((Math.min(p.at, duration) / duration) * width),
		round(mid - (Math.max(-limit, Math.min(limit, p.lead)) / limit) * mid)
	]);
	const line = xy.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x} ${y}`).join(' ');
	const firstX = xy[0][0];
	const lastX = xy[xy.length - 1][0];
	return { line, area: `${line} L${lastX} ${mid} L${firstX} ${mid} Z` };
}

/** `+3.2k`, `−800`: a lead for an axis label, with a true minus sign. */
export function formatLead(gold: number): string {
	const sign = gold > 0 ? '+' : gold < 0 ? '−' : '';
	const size = Math.abs(gold);
	const amount =
		size >= 1000 ? `${Number((size / 1000).toFixed(1)).toLocaleString('en-GB')}k` : String(size);
	return `${sign}${amount}`;
}
