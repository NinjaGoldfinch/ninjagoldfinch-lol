import type { Shard } from '#lib/api/cdragon.ts';
import type { Rune, StaticNames, Named } from '#lib/api/ddragon.ts';
import {
	OBJECTIVES,
	type Match,
	type Objective,
	type Participant,
	type Timeline
} from '#lib/api/match.ts';
import { itemSteps, skillOrder, toRunePage, type Build } from './builds.ts';
import type { Region } from './regions.ts';
import { sameRiotId, type RiotId } from './riot-id.ts';
import { loadoutOf, patchOf, type MatchRow } from './matches.ts';
import { objectiveKills, type GoldFrame, type ObjectiveKill } from './timeline.ts';

/** One player's scoreboard line: only what the page renders. */
export interface ScoreboardLine {
	/** Riot's id for the player within the match (1–10), as in `Build`. */
	participantId: number;
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
	/** Objective kills from the timeline, in game order; null without one. */
	objectives: ObjectiveKill[] | null;
	/** Every player's build, in Riot's order. */
	builds: Build[];
}

const TEAM_NAMES: Record<number, string> = { 100: 'Blue team', 200: 'Red team' };

const NO_OBJECTIVES = Object.fromEntries(OBJECTIVES.map((key) => [key, 0])) as Record<
	Objective,
	number
>;

/**
 * Shapes a match into one scoreboard per team, players in Riot's order, plus
 * each team's gold over time and the objectives taken from the timeline when
 * there is one. Every
 * team's result reads `remake` when the game ended in an early surrender.
 */
export function toMatchDetail(
	match: Match,
	names: StaticNames,
	{
		region,
		ddragonVersion,
		timeline,
		shards = {}
	}: {
		region: Region;
		ddragonVersion: string;
		timeline?: Timeline;
		shards?: Record<number, Shard>;
	}
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
		gold: timeline ? teamGold(timeline, match, teamIds) : null,
		objectives: timeline ? objectiveKills(timeline.objectives, teamIds) : null,
		builds: match.participants.map((p) => ({
			participantId: p.participantId,
			items: timeline ? itemSteps(timeline.events, p.participantId, names) : null,
			skills: timeline ? skillOrder(timeline.events, p.participantId) : null,
			runes: toRunePage(p.runePage, names, shards)
		}))
	};
}

function toLine(p: Participant, names: StaticNames): ScoreboardLine {
	return {
		participantId: p.participantId,
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

/**
 * Whose build to show for a requested participant id, or with none (the
 * header's build link): the player `build` names, else the highlighted
 * player, else the first player (normally Blue's top laner).
 */
export function selectBuild(
	detail: Pick<MatchDetail, 'teams' | 'builds'>,
	build: string | null,
	highlight: RiotId | null
): Build | undefined {
	const lines = detail.teams.flatMap((t) => t.players);
	const wanted =
		lines.find((l) => build !== null && String(l.participantId) === build) ??
		lines.find((l) => highlight && l.riotId && sameRiotId(l.riotId, highlight)) ??
		lines[0];
	return detail.builds.find((b) => b.participantId === wanted?.participantId);
}

/**
 * Which build the match page has open, as a participant id: the one shallow
 * routing recorded when the visitor opened or closed a popup, else `?build=`
 * from the URL the page was loaded with. null when none is open.
 */
export function openBuildId(
	state: number | null | undefined,
	fromUrl: string | null
): string | null {
	if (state === undefined) return fromUrl;
	return state === null ? null : String(state);
}

/** The match page's tabs; the scoreboard is the default and has no `?tab=`. */
export const MATCH_TABS = ['scoreboard', 'timeline'] as const;
export type MatchTab = (typeof MATCH_TABS)[number];

/** The tab `?tab=` asks for; anything unknown is the scoreboard. */
export function matchTab(fromUrl: string | null): MatchTab {
	return MATCH_TABS.find((tab) => tab === fromUrl) ?? 'scoreboard';
}

/**
 * The match page URL. `player` is whose champion to highlight: the profile the
 * visitor came from, written `GameName-TAG` as in profile URLs. `tab` is which
 * tab to show. `build` is whose build to show, by participant id.
 */
export function matchPath(
	region: string,
	matchId: string,
	{ player, tab, build }: { player?: RiotId | null; tab?: MatchTab; build?: number } = {}
): string {
	const query = new URLSearchParams();
	if (player) query.set('player', `${player.gameName}-${player.tagLine}`);
	if (tab && tab !== 'scoreboard') query.set('tab', tab);
	if (build !== undefined) query.set('build', String(build));
	const search = query.size > 0 ? `?${query}` : '';
	return `/match/${region}/${encodeURIComponent(matchId)}${search}`;
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
