import type { components } from '#lib/api/schema.d.ts';

type MatchSummary = components['schemas']['MatchSummary'];

/** One row of a player's match history: only what the page renders. */
export interface MatchRow {
	matchId: string;
	queueId: number | null;
	/** Epoch milliseconds. */
	playedAt: number | null;
	/** Seconds. */
	duration: number | null;
	/** `major.minor` of the game build, e.g. `16.20`. */
	patch: string | null;
	result: 'win' | 'loss' | 'remake';
	champion: { id: number; name: string; level: number | null };
	kills: number;
	deaths: number;
	assists: number;
	cs: number;
	/** item0–item6; 0 is an empty slot. */
	items: number[];
	spells: number[];
	position: string | null;
}

/**
 * Shapes riot-proxy's summaries into rows, dropping any without the player's
 * own line or champion, which there is nothing to render for.
 */
export function toMatchRows(summaries: MatchSummary[]): MatchRow[] {
	return summaries.flatMap((m): MatchRow[] => {
		const p = m.player;
		if (!p || p.championId == null || !p.championName) return [];

		return [
			{
				matchId: m.matchId,
				queueId: m.queueId ?? null,
				playedAt: m.gameCreation ?? null,
				duration: m.gameDuration ?? null,
				patch: patchOf(m.gameVersion),
				result: p.gameEndedInEarlySurrender ? 'remake' : p.win ? 'win' : 'loss',
				champion: { id: p.championId, name: p.championName, level: p.champLevel ?? null },
				kills: p.kills ?? 0,
				deaths: p.deaths ?? 0,
				assists: p.assists ?? 0,
				cs: (p.totalMinionsKilled ?? 0) + (p.neutralMinionsKilled ?? 0),
				items: [p.item0, p.item1, p.item2, p.item3, p.item4, p.item5, p.item6].map((i) => i ?? 0),
				spells: [p.summoner1Id, p.summoner2Id].map((s) => s ?? 0),
				position: p.teamPosition || null
			}
		];
	});
}

/**
 * `major.minor` of a game build such as `16.20.824.8524`. riot-proxy's spec
 * calls gameVersion a Data Dragon version, but it is the game build.
 */
export function patchOf(gameVersion: string | null | undefined): string | null {
	const match = gameVersion?.match(/^(\d+)\.(\d+)\./);
	return match ? `${match[1]}.${match[2]}` : null;
}
