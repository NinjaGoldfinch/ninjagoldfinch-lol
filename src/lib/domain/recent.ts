import { riotIdKey, type RiotId } from './riot-id.ts';

/** A profile the visitor opened, kept in their browser only. */
export type RecentSearch = RiotId;

export const MAX_RECENT = 8;

/** Puts `entry` first, drops an earlier copy of it (ignoring case), keeps the newest few. */
export function addRecent(list: RecentSearch[], entry: RecentSearch): RecentSearch[] {
	return [entry, ...list.filter((r) => riotIdKey(r) !== riotIdKey(entry))].slice(0, MAX_RECENT);
}

/**
 * Reads a stored list, ignoring anything malformed. Entries stored before
 * profiles lost their region (ADR-037) still carry one; it is dropped, and a
 * player stored under two regions is kept once.
 */
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
				typeof r.gameName === 'string' &&
				typeof r.tagLine === 'string'
		)
		.map(({ gameName, tagLine }) => ({ gameName, tagLine }))
		.reduceRight<RecentSearch[]>((list, entry) => addRecent(list, entry), [])
		.slice(0, MAX_RECENT);
}
