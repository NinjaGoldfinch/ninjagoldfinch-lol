import type { Rune, StaticNames, Named } from '#lib/api/ddragon.ts';
import {
	OBJECTIVES,
	type Match,
	type Objective,
	type Participant,
	type Timeline
} from '#lib/api/match.ts';
import type { Region } from './regions.ts';
import type { RiotId } from './riot-id.ts';
import { loadoutOf, patchOf, type MatchRow } from './matches.ts';

/** One player's scoreboard line: only what the page renders. */
export interface ScoreboardLine {
	/** null when Riot did not report one. */
	riotId: RiotId | null;
	champion: MatchRow['champion'];
	position: string | null;
	kills: number;
	deaths: number;
	assists: number;
	cs: number;
	gold: number;
	/** Damage dealt to champions. */
	damage: number;
	vision: number;
	items: MatchRow['items'];
	roleBoundItem?: MatchRow['roleBoundItem'];
	spells: (Named | null)[];
	runes: { keystone: Rune | null; secondary: Rune | null };
}

export interface TeamScoreboard {
	teamId: number;
	/** `Blue team`, `Red team`, or `Team <id>` for anything else. */
	name: string;
	result: 'win' | 'loss' | 'remake';
	kills: number;
	deaths: number;
	assists: number;
	gold: number;
	objectives: Record<Objective, number>;
	bans: { id: number; key: string | null; name: string }[];
	players: ScoreboardLine[];
}

/** Both teams' gold at one timeline frame, in the order of `MatchDetail.teams`. */
export interface GoldFrame {
	/** Seconds from the start of the game. */
	at: number;
	teamGold: number[];
}

/** Everything the match page renders, and nothing more: it is embedded in the HTML. */
export interface MatchDetail {
	matchId: string;
	region: { slug: string; label: string };
	queueId: number | null;
	/** Short queue name, e.g. `Ranked Solo`. */
	queue: string;
	/** Epoch milliseconds. */
	startedAt: number | null;
	/** Seconds. */
	duration: number | null;
	/** `major.minor` of the game build, e.g. `16.20`. */
	patch: string | null;
	/** The Data Dragon version for the game's icons. */
	ddragonVersion: string;
	teams: TeamScoreboard[];
	/** From the timeline; null when it could not be loaded. */
	gold: GoldFrame[] | null;
}

const TEAM_NAMES: Record<number, string> = { 100: 'Blue team', 200: 'Red team' };

const NO_OBJECTIVES = Object.fromEntries(OBJECTIVES.map((key) => [key, 0])) as Record<
	Objective,
	number
>;

/**
 * Shapes a match into one scoreboard per team, players in Riot's order, plus
 * each team's gold over time from the timeline when there is one. Every
 * team's result reads `remake` when the game ended in an early surrender.
 */
export function toMatchDetail(
	match: Match,
	names: StaticNames,
	{
		region,
		ddragonVersion,
		timeline
	}: { region: Region; ddragonVersion: string; timeline?: Timeline }
): MatchDetail {
	const remake = match.participants.some((p) => p.gameEndedInEarlySurrender);
	const teamIds = [...new Set(match.participants.map((p) => p.teamId))];

	return {
		matchId: match.matchId,
		region: { slug: region.slug, label: region.label },
		queueId: match.queueId,
		queue:
			match.queueId === null
				? 'Unknown queue'
				: (names.queues[match.queueId] ?? `Queue ${match.queueId}`),
		startedAt: match.gameCreation,
		duration: match.gameDuration,
		patch: patchOf(match.gameVersion),
		ddragonVersion,
		teams: teamIds.map((teamId): TeamScoreboard => {
			const players = match.participants.filter((p) => p.teamId === teamId);
			const team = match.teams.find((t) => t.teamId === teamId);
			const win = team?.win ?? players.some((p) => p.win);
			const sum = (pick: (p: Participant) => number) =>
				players.reduce((total, p) => total + pick(p), 0);
			return {
				teamId,
				name: TEAM_NAMES[teamId] ?? `Team ${teamId}`,
				result: remake ? 'remake' : win ? 'win' : 'loss',
				kills: sum((p) => p.kills),
				deaths: sum((p) => p.deaths),
				assists: sum((p) => p.assists),
				gold: sum((p) => p.goldEarned),
				objectives: team?.objectives ?? NO_OBJECTIVES,
				bans: (team?.bans ?? []).map((id) => ({
					id,
					key: names.champions[id]?.id ?? null,
					name: names.champions[id]?.name ?? `Champion ${id}`
				})),
				players: players.map((p) => toLine(p, names))
			};
		}),
		gold: timeline ? teamGold(timeline, match, teamIds) : null
	};
}

function toLine(p: Participant, names: StaticNames): ScoreboardLine {
	return {
		riotId:
			p.riotIdGameName && p.riotIdTagline
				? { gameName: p.riotIdGameName, tagLine: p.riotIdTagline }
				: null,
		champion: {
			id: p.championId,
			key: names.champions[p.championId]?.id ?? null,
			name: names.champions[p.championId]?.name ?? p.championName ?? `Champion ${p.championId}`,
			level: p.champLevel
		},
		position: p.teamPosition,
		kills: p.kills,
		deaths: p.deaths,
		assists: p.assists,
		cs: p.totalMinionsKilled + p.neutralMinionsKilled,
		gold: p.goldEarned,
		damage: p.totalDamageDealtToChampions,
		vision: p.visionScore,
		...loadoutOf(p, names)
	};
}

/**
 * Each team's gold at every timeline frame: the sum of its players'
 * `totalGold`. Teams are in the order given; players come from the match,
 * since the timeline does not say who is on which team.
 */
export function teamGold(timeline: Timeline, match: Match, teamIds: number[]): GoldFrame[] {
	const teamOf = new Map(match.participants.map((p) => [p.participantId, p.teamId]));
	return timeline.frames.map((frame) => {
		const teamGold = teamIds.map(() => 0);
		for (const [id, gold] of Object.entries(frame.totalGold)) {
			const index = teamIds.indexOf(teamOf.get(Number(id)) ?? -1);
			if (index !== -1) teamGold[index] += gold;
		}
		return { at: Math.round(frame.timestamp / 1000), teamGold };
	});
}

/**
 * Riot's match id carries its platform (`OC1_712351051`). A match is only
 * looked up in the region whose platform it names.
 */
export function isMatchIdFor(region: Region, matchId: string): boolean {
	const match = /^([A-Z0-9]+)_([0-9]+)$/.exec(matchId);
	return match !== null && match[1] === region.platform.toUpperCase();
}

/** The match page URL. */
export function matchPath(region: string, matchId: string): string {
	return `/match/${region}/${encodeURIComponent(matchId)}`;
}

/** `9 Oct 2026, 09:12 UTC`: the page is cached for a day, so no "N hours ago". */
export function formatMatchDate(epochMs: number): string {
	const date = new Date(epochMs);
	const day = date.toLocaleDateString('en-GB', {
		day: 'numeric',
		month: 'short',
		year: 'numeric',
		timeZone: 'UTC'
	});
	const time = date.toLocaleTimeString('en-GB', {
		hour: '2-digit',
		minute: '2-digit',
		timeZone: 'UTC'
	});
	return `${day}, ${time} UTC`;
}
