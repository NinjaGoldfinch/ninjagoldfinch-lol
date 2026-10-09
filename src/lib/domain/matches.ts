import type { Named, Rune, StaticNames } from '#lib/api/ddragon.ts';
import type { components } from '#lib/api/schema.d.ts';
import { formatAge } from './age.ts';

type MatchSummary = components['schemas']['MatchSummary'];

/** One row of a player's match history: only what the page renders. */
export interface MatchRow {
	matchId: string;
	queueId: number | null;
	/** Short queue name, e.g. `Ranked Solo`. */
	queue: string;
	/** When the game started, in words, as of when the page was built. */
	playedAgo: string | null;
	/** Seconds. */
	duration: number | null;
	/** `major.minor` of the game build, e.g. `16.20`. */
	patch: string | null;
	result: 'win' | 'loss' | 'remake';
	/** `key` is the Data Dragon id for the icon; null if the patch does not know it. */
	champion: { id: number; key: string | null; name: string; level: number | null };
	kills: number;
	deaths: number;
	assists: number;
	cs: number;
	/** Slots item0–item6 (6 is the trinket); null for an empty slot. */
	items: ({ id: number; name: string } | null)[];
	spells: (Named | null)[];
	/** The keystone and the secondary path. */
	runes: { keystone: Rune | null; secondary: Rune | null };
	/** Riot's teamPosition: TOP, JUNGLE, MIDDLE, BOTTOM or UTILITY; null when there is none. */
	position: string | null;
}

/**
 * Shapes riot-proxy's summaries into rows, dropping any without the player's
 * own line or champion, which there is nothing to render for.
 */
export function toMatchRows(
	summaries: MatchSummary[],
	names: StaticNames,
	now = Date.now()
): MatchRow[] {
	return summaries.flatMap((m): MatchRow[] => {
		const p = m.player;
		if (!p || p.championId == null || !p.championName) return [];
		const queueId = m.queueId ?? null;

		return [
			{
				matchId: m.matchId,
				queueId,
				queue: queueId === null ? 'Unknown queue' : (names.queues[queueId] ?? `Queue ${queueId}`),
				playedAgo: m.gameCreation == null ? null : formatAge((now - m.gameCreation) / 1000),
				duration: m.gameDuration ?? null,
				patch: patchOf(m.gameVersion),
				result: p.gameEndedInEarlySurrender ? 'remake' : p.win ? 'win' : 'loss',
				champion: {
					id: p.championId,
					key: names.champions[p.championId]?.id ?? null,
					name: names.champions[p.championId]?.name ?? p.championName,
					level: p.champLevel ?? null
				},
				kills: p.kills ?? 0,
				deaths: p.deaths ?? 0,
				assists: p.assists ?? 0,
				cs: (p.totalMinionsKilled ?? 0) + (p.neutralMinionsKilled ?? 0),
				items: [p.item0, p.item1, p.item2, p.item3, p.item4, p.item5, p.item6].map((id) =>
					id ? { id, name: names.items[id] ?? `Item ${id}` } : null
				),
				spells: [p.summoner1Id, p.summoner2Id].map((id) =>
					id ? (names.spells[id] ?? null) : null
				),
				runes: {
					keystone: (p.perks?.keystone && names.runes[p.perks.keystone]) || null,
					secondary: (p.perks?.subStyle && names.runes[p.perks.subStyle]) || null
				},
				position: p.teamPosition || null
			}
		];
	});
}

/**
 * Custom games (queue 0) are never shown: Riot policy keeps custom-queue
 * history private without the player's opt-in. A game with no queue id is
 * treated the same, since it cannot be shown not to be custom.
 */
export function isCustomGame(summary: MatchSummary): boolean {
	return summary.queueId == null || summary.queueId === 0;
}

/**
 * `major.minor` of a game build such as `16.20.824.8524`. riot-proxy's spec
 * calls gameVersion a Data Dragon version, but it is the game build.
 */
export function patchOf(gameVersion: string | null | undefined): string | null {
	const match = gameVersion?.match(/^(\d+)\.(\d+)\./);
	return match ? `${match[1]}.${match[2]}` : null;
}

/** `32:32`, or `1:02:05` past an hour. */
export function formatDuration(seconds: number): string {
	const h = Math.floor(seconds / 3600);
	const m = Math.floor((seconds % 3600) / 60);
	const s = Math.floor(seconds % 60);
	const mm = h > 0 ? String(m).padStart(2, '0') : String(m);
	return `${h > 0 ? `${h}:` : ''}${mm}:${String(s).padStart(2, '0')}`;
}

/** (kills + assists) / deaths to two places, or `Perfect` with no deaths. */
export function kdaRatio(kills: number, deaths: number, assists: number): string {
	return deaths === 0 ? 'Perfect' : ((kills + assists) / deaths).toFixed(2);
}

/** CS per minute to one place. */
export function csPerMinute(cs: number, seconds: number): string {
	return seconds > 0 ? ((cs * 60) / seconds).toFixed(1) : '0.0';
}
