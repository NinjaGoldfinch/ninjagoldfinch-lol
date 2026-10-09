import type { RiotId } from './riot-id.ts';

/** A profile the visitor opened, kept in their browser only. */
export interface RecentSearch extends RiotId {
	region: string;
}

export const MAX_RECENT = 8;

/** Puts `entry` first, drops an earlier copy of it (ignoring case), keeps the newest few. */
export function addRecent(list: RecentSearch[], entry: RecentSearch): RecentSearch[] {
	const key = (r: RecentSearch) => `${r.region}/${r.gameName}#${r.tagLine}`.toLowerCase();
	return [entry, ...list.filter((r) => key(r) !== key(entry))].slice(0, MAX_RECENT);
}

/** Reads a stored list, ignoring anything malformed. */
export function parseRecent(raw: string | null): RecentSearch[] {
	let value: unknown;
	try {
		value = JSON.parse(raw ?? '[]');
	} catch {
		return [];
	}
	if (!Array.isArray(value)) return [];

	return value
		.filter(
			(r): r is RecentSearch =>
				typeof r === 'object' &&
				r !== null &&
				typeof r.region === 'string' &&
				typeof r.gameName === 'string' &&
				typeof r.tagLine === 'string'
		)
		.slice(0, MAX_RECENT);
}
