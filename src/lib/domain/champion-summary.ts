import { csPerMinute, kdaRatio, type MatchRow } from './matches.ts';

/** One champion's games among the matches shown. */
export interface ChampionSummary {
	id: number;
	/** Data Dragon id for the icon; null if the patch does not know it. */
	key: string | null;
	name: string;
	games: number;
	wins: number;
	losses: number;
	/** Whole percent. */
	winRate: number;
	/** Averages per game, to one place. */
	kills: string;
	deaths: string;
	assists: string;
	kda: string;
	/** CS per minute over the games with a known duration. */
	csPerMinute: string;
}

/**
 * What the champion summary covers: the matches shown, less the remakes it
 * leaves out. `shown` counts every row, remakes included.
 */
export function summaryCaption(champions: ChampionSummary[], shown: number): string {
	const games = champions.reduce((n, c) => n + c.games, 0);
	const remakes = shown - games;
	const caption = `From the ${games} ${games === 1 ? 'match' : 'matches'} shown`;
	return remakes > 0
		? `${caption}, leaving out ${remakes} ${remakes === 1 ? 'remake' : 'remakes'}`
		: caption;
}

/**
 * Groups the given match rows by champion. Remakes are left out: they are not
 * real games. Most played first, then most wins, then by name.
 */
export function summariseChampions(rows: MatchRow[]): ChampionSummary[] {
	const groups = new Map<number, MatchRow[]>();
	for (const row of rows) {
		if (row.result === 'remake') continue;
		groups.set(row.champion.id, [...(groups.get(row.champion.id) ?? []), row]);
	}

	return [...groups.values()]
		.map((games): ChampionSummary => {
			const sum = (pick: (r: MatchRow) => number) => games.reduce((n, r) => n + pick(r), 0);
			const timed = games.filter((r) => r.duration !== null);
			const wins = games.filter((r) => r.result === 'win').length;
			const [kills, deaths, assists] = [
				sum((r) => r.kills),
				sum((r) => r.deaths),
				sum((r) => r.assists)
			];
			const average = (total: number) => (total / games.length).toFixed(1);

			return {
				id: games[0].champion.id,
				key: games[0].champion.key,
				name: games[0].champion.name,
				games: games.length,
				wins,
				losses: games.length - wins,
				winRate: Math.round((wins * 100) / games.length),
				kills: average(kills),
				deaths: average(deaths),
				assists: average(assists),
				kda: kdaRatio(kills, deaths, assists),
				csPerMinute: csPerMinute(
					timed.reduce((n, r) => n + r.cs, 0),
					timed.reduce((n, r) => n + (r.duration ?? 0), 0)
				)
			};
		})
		.sort((a, b) => b.games - a.games || b.wins - a.wins || a.name.localeCompare(b.name));
}
