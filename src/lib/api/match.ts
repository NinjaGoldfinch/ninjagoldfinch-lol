// Riot's match-v5 match and timeline payloads. riot-proxy passes them through
// unmodified but declares no schema for them, so their generated type is
// `unknown`. The fields the site reads are typed here from Riot's MatchDto and
// TimelineDto and checked when parsed. ADR-006, ADR-023.

/** One player's line in a match: the fields the site reads. */
export interface Participant {
	participantId: number;
	teamId: number;
	riotIdGameName: string | null;
	riotIdTagline: string | null;
	championId: number;
	championName: string | null;
	champLevel: number | null;
	/** TOP, JUNGLE, MIDDLE, BOTTOM or UTILITY; null when the game has no lanes. */
	teamPosition: string | null;
	kills: number;
	deaths: number;
	assists: number;
	totalMinionsKilled: number;
	neutralMinionsKilled: number;
	goldEarned: number;
	totalDamageDealtToChampions: number;
	visionScore: number;
	/** 0 is an empty slot; item6 is the trinket. */
	item0: number;
	item1: number;
	item2: number;
	item3: number;
	item4: number;
	item5: number;
	item6: number;
	/** The role quest slot; null when Riot did not record one. */
	roleBoundItem: number | null;
	summoner1Id: number;
	summoner2Id: number;
	/** The primary path's first rune, and the secondary path. */
	perks: { keystone: number | null; subStyle: number | null };
	runePage: RunePage;
	win: boolean;
	gameEndedInEarlySurrender: boolean;
}

/** A rune page as perk ids: each path's runes in slot order, then the stat shards. */
export interface RunePage {
	primary: { style: number | null; perks: number[] };
	secondary: { style: number | null; perks: number[] };
	/** Offense, flex and defense shards; missing ones are left out. */
	shards: number[];
}

/** Team objective kill counts, by Riot's `objectives` keys. */
export const OBJECTIVES = ['tower', 'inhibitor', 'dragon', 'baron', 'riftHerald', 'horde'] as const;
export type Objective = (typeof OBJECTIVES)[number];

export interface Team {
	teamId: number;
	win: boolean;
	/** Banned champion ids, in pick order; Riot's -1 (no ban) is dropped. */
	bans: number[];
	objectives: Record<Objective, number>;
}

export interface Match {
	matchId: string;
	queueId: number | null;
	/** Epoch milliseconds. */
	gameCreation: number | null;
	/** Seconds (Riot has reported seconds since patch 11.20). */
	gameDuration: number | null;
	/** The game build, e.g. `16.20.824.8524`. */
	gameVersion: string | null;
	participants: Participant[];
	teams: Team[];
}

export interface TimelineFrame {
	/** Milliseconds from the start of the game. */
	timestamp: number;
	/** Each player's gold earned so far, by participantId. */
	totalGold: Record<number, number>;
}

/** A purchase or sale. */
export interface ItemEvent {
	type: 'ITEM_PURCHASED' | 'ITEM_SOLD';
	participantId: number;
	timestamp: number;
	itemId: number;
}

/**
 * An undone purchase or sale. Riot names the item in `beforeId` or `afterId`
 * (the other is 0), not consistently by which was undone.
 */
export interface ItemUndoEvent {
	type: 'ITEM_UNDO';
	participantId: number;
	timestamp: number;
	beforeId: number;
	afterId: number;
}

export interface SkillEvent {
	type: 'SKILL_LEVEL_UP';
	participantId: number;
	timestamp: number;
	/** 1–4: Q, W, E, R. */
	skillSlot: number;
	/** NORMAL, or EVOLVE for an evolution (Kha'Zix, Viktor, ...). */
	levelUpType: string | null;
}

export type TimelineEvent = ItemEvent | ItemUndoEvent | SkillEvent;

export interface Timeline {
	matchId: string;
	frames: TimelineFrame[];
	/** The item and skill events the site reads, in game order. */
	events: TimelineEvent[];
}

/**
 * Projects a match-v5 match to the fields above. undefined when the payload
 * lacks what every page needs: the match id and, for each player, their
 * participant id, team and champion. Other missing fields read as 0, false or
 * null.
 */
export function parseMatch(body: unknown): Match | undefined {
	const metadata = record(record(body)?.metadata);
	const info = record(record(body)?.info);
	const matchId = string(metadata?.matchId);
	if (!info || !matchId || !Array.isArray(info.participants)) return undefined;

	const participants: Participant[] = [];
	for (const value of info.participants) {
		const participant = parseParticipant(value);
		if (!participant) return undefined;
		participants.push(participant);
	}
	if (participants.length === 0) return undefined;

	const teams = (Array.isArray(info.teams) ? info.teams : []).flatMap((value): Team[] => {
		const team = record(value);
		const teamId = number(team?.teamId);
		if (!team || teamId === null) return [];
		const objectives = record(team.objectives);
		return [
			{
				teamId,
				win: team.win === true,
				bans: (Array.isArray(team.bans) ? team.bans : []).flatMap((ban) => {
					const id = number(record(ban)?.championId);
					return id !== null && id > 0 ? [id] : [];
				}),
				objectives: Object.fromEntries(
					OBJECTIVES.map((key) => [key, number(record(objectives?.[key])?.kills) ?? 0])
				) as Record<Objective, number>
			}
		];
	});

	return {
		matchId,
		queueId: number(info.queueId),
		gameCreation: number(info.gameCreation),
		gameDuration: number(info.gameDuration),
		gameVersion: string(info.gameVersion),
		participants,
		teams
	};
}

/**
 * Projects a match-v5 timeline to its frames' gold and its item and skill
 * events. undefined without a match id or a list of frames; a frame or event
 * missing a field the site reads is dropped.
 */
export function parseTimeline(body: unknown): Timeline | undefined {
	const matchId = string(record(record(body)?.metadata)?.matchId);
	const frames = record(record(body)?.info)?.frames;
	if (!matchId || !Array.isArray(frames)) return undefined;

	return {
		matchId,
		events: frames.flatMap((frame) => {
			const events = record(frame)?.events;
			return (Array.isArray(events) ? events : []).flatMap(parseEvent);
		}),
		frames: frames.flatMap((value): TimelineFrame[] => {
			const frame = record(value);
			const timestamp = number(frame?.timestamp);
			if (!frame || timestamp === null) return [];
			const totalGold: Record<number, number> = {};
			for (const [id, player] of Object.entries(record(frame.participantFrames) ?? {})) {
				const gold = number(record(player)?.totalGold);
				if (gold !== null) totalGold[Number(id)] = gold;
			}
			return [{ timestamp, totalGold }];
		})
	};
}

function parseEvent(value: unknown): TimelineEvent[] {
	const e = record(value);
	const participantId = number(e?.participantId);
	const timestamp = number(e?.timestamp);
	if (!e || participantId === null || timestamp === null) return [];

	switch (e.type) {
		case 'ITEM_PURCHASED':
		case 'ITEM_SOLD': {
			const itemId = number(e.itemId);
			return itemId ? [{ type: e.type, participantId, timestamp, itemId }] : [];
		}
		case 'ITEM_UNDO': {
			const beforeId = number(e.beforeId) ?? 0;
			const afterId = number(e.afterId) ?? 0;
			return beforeId || afterId
				? [{ type: 'ITEM_UNDO', participantId, timestamp, beforeId, afterId }]
				: [];
		}
		case 'SKILL_LEVEL_UP': {
			const skillSlot = number(e.skillSlot);
			return skillSlot !== null && skillSlot >= 1 && skillSlot <= 4
				? [
						{
							type: 'SKILL_LEVEL_UP',
							participantId,
							timestamp,
							skillSlot,
							levelUpType: string(e.levelUpType)
						}
					]
				: [];
		}
		default:
			return [];
	}
}

function parseParticipant(value: unknown): Participant | undefined {
	const p = record(value);
	const participantId = number(p?.participantId);
	const teamId = number(p?.teamId);
	const championId = number(p?.championId);
	if (!p || participantId === null || teamId === null || championId === null) return undefined;

	const count = (key: string) => number(p[key]) ?? 0;
	const styles = record(p.perks)?.styles;
	const style = (description: string) =>
		(Array.isArray(styles) ? styles : []).map(record).find((s) => s?.description === description);
	const path = (description: string) => {
		const s = style(description);
		const selections = Array.isArray(s?.selections) ? s.selections : [];
		return {
			style: number(s?.style),
			perks: selections.flatMap((sel) => {
				const perk = number(record(sel)?.perk);
				return perk ? [perk] : [];
			})
		};
	};
	const primary = path('primaryStyle');
	const secondary = path('subStyle');
	const stats = record(record(p.perks)?.statPerks);

	return {
		participantId,
		teamId,
		riotIdGameName: string(p.riotIdGameName) || null,
		riotIdTagline: string(p.riotIdTagline) || null,
		championId,
		championName: string(p.championName) || null,
		champLevel: number(p.champLevel),
		teamPosition: string(p.teamPosition) || null,
		kills: count('kills'),
		deaths: count('deaths'),
		assists: count('assists'),
		totalMinionsKilled: count('totalMinionsKilled'),
		neutralMinionsKilled: count('neutralMinionsKilled'),
		goldEarned: count('goldEarned'),
		totalDamageDealtToChampions: count('totalDamageDealtToChampions'),
		visionScore: count('visionScore'),
		item0: count('item0'),
		item1: count('item1'),
		item2: count('item2'),
		item3: count('item3'),
		item4: count('item4'),
		item5: count('item5'),
		item6: count('item6'),
		roleBoundItem: number(p.roleBoundItem),
		summoner1Id: count('summoner1Id'),
		summoner2Id: count('summoner2Id'),
		perks: { keystone: primary.perks[0] ?? null, subStyle: secondary.style },
		runePage: {
			primary,
			secondary,
			shards: [stats?.offense, stats?.flex, stats?.defense].flatMap((v) => {
				const id = number(v);
				return id ? [id] : [];
			})
		},
		win: p.win === true,
		gameEndedInEarlySurrender: p.gameEndedInEarlySurrender === true
	};
}

function record(value: unknown): Record<string, unknown> | undefined {
	return typeof value === 'object' && value !== null && !Array.isArray(value)
		? (value as Record<string, unknown>)
		: undefined;
}

function number(value: unknown): number | null {
	return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function string(value: unknown): string | null {
	return typeof value === 'string' ? value : null;
}
