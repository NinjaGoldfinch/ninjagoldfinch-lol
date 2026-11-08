import { championPath } from './champion-search.ts';
import {
	sortRows,
	type ChampionFilter,
	type ChampionRow,
	type ChampionTable
} from './champion-stats.ts';
import { profilePath } from './riot-id.ts';

// The front page's cards (ADR-066): shaped here, loaded by
// src/lib/server/front-page.ts.

/** The top-win-rate card's rows: Ranked Solo, every role, tier, region and patch, as `/champions`. */
export const FRONT_FILTER: ChampionFilter = { role: null, patch: 'all', rank: null };

/**
 * Games a champion needs before its win rate can lead the front page. Applied
 * here, not on the wire: riot-proxy is still asked for every row (ADR-035).
 */
export const TOP_WIN_RATE_MIN_GAMES = 800;

/** How many champions the card lists. */
export const TOP_WIN_RATE_COUNT = 6;

/** Highest win rate first, over the floor; ties by games, then name (`sortRows`). */
export function topWinRates(
	table: ChampionTable,
	minGames = TOP_WIN_RATE_MIN_GAMES,
	count = TOP_WIN_RATE_COUNT
): ChampionRow[] {
	return sortRows(
		table.rows.filter((row) => row.games >= minGames),
		'win'
	).slice(0, count);
}

/** The bar behind a win rate, in whole percent: 0 at `lo` (45 %), 100 at `hi` (60 %), clamped. */
export function winRateBar(winRate: number, lo = 0.45, hi = 0.6): number {
	const share = (winRate - lo) / (hi - lo);
	return Math.round(Math.min(1, Math.max(0, share)) * 100);
}

/** A count with thousands separators: `211,590`. */
export function formatCount(n: number): string {
	return n.toLocaleString('en-US');
}

/** Example searches under the hero form: two champions and a player. */
export const EXAMPLE_SEARCHES: readonly { label: string; href: string }[] = [
	{ label: 'Ahri', href: championPath({ id: 'Ahri', name: 'Ahri' }) },
	{ label: 'Jinx', href: championPath({ id: 'Jinx', name: 'Jinx' }) },
	{
		label: 'NinjaGoldfinch#OCENZ',
		href: profilePath({ gameName: 'NinjaGoldfinch', tagLine: 'OCENZ' })
	}
];
