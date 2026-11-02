import type { LeagueEntry } from '#lib/api/riot.ts';

/** A ranked queue as the profile shows it. Official rank only: no MMR estimates. */
export interface RankView {
	queue: string;
	/** e.g. `Emerald III`, or `Master` (apex tiers have no division). */
	tier: string;
	leaguePoints: number;
	wins: number;
	losses: number;
	/** Whole percent. */
	winRate: number;
}

const QUEUES: Record<string, string> = {
	RANKED_SOLO_5x5: 'Ranked Solo/Duo',
	RANKED_FLEX_SR: 'Ranked Flex'
};
const QUEUE_ORDER = Object.keys(QUEUES);
const APEX = new Set(['MASTER', 'GRANDMASTER', 'CHALLENGER']);

/** Solo/Duo first, then Flex; other queues are left out. */
export function describeRanks(entries: LeagueEntry[]): RankView[] {
	return entries
		.filter((e) => e.queueType in QUEUES)
		.sort((a, b) => QUEUE_ORDER.indexOf(a.queueType) - QUEUE_ORDER.indexOf(b.queueType))
		.map((e) => {
			const tier = titleCase(e.tier);
			const games = e.wins + e.losses;
			return {
				queue: QUEUES[e.queueType],
				tier: APEX.has(e.tier) ? tier : `${tier} ${e.rank}`,
				leaguePoints: e.leaguePoints,
				wins: e.wins,
				losses: e.losses,
				winRate: games > 0 ? Math.round((e.wins * 100) / games) : 0
			};
		});
}

/** `EMERALD` → `Emerald`. */
export function titleCase(word: string): string {
	return word.charAt(0) + word.slice(1).toLowerCase();
}
