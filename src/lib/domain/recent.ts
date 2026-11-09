import { record } from '#lib/api/json.ts';
import { findRegion } from './regions.ts';
import { riotIdKey, type RiotId } from './riot-id.ts';

/** A profile the visitor opened, kept in their browser only (ADR-068). */
export interface RecentSearch extends RiotId {
	/** The profile's region slug, as riot-proxy named its platform (ADR-037); absent on older entries. */
	region?: string;
	/** The profile icon when it was viewed; absent when unknown. */
	profileIconId?: number;
	/** The Solo/Duo rank as the profile showed it (`Emerald III`); absent when unranked or unknown. */
	rank?: string;
	/** When the profile was last viewed, in ms since the epoch; absent on older entries. */
	viewedAt?: number;
}

export const MAX_RECENT = 8;

/** Puts `entry` first, drops an earlier copy of it (ignoring case), keeps the newest few. */
export function addRecent(list: RecentSearch[], entry: RecentSearch): RecentSearch[] {
	return [entry, ...list.filter((r) => riotIdKey(r) !== riotIdKey(entry))].slice(0, MAX_RECENT);
}

/** One stored entry: the Riot ID it needs, and each other field only when well-formed. */
function parseEntry(value: unknown): RecentSearch[] {
	const r = record(value);
	if (!r || typeof r.gameName !== 'string' || typeof r.tagLine !== 'string') return [];

	const entry: RecentSearch = { gameName: r.gameName, tagLine: r.tagLine };
	const region = typeof r.region === 'string' ? findRegion(r.region) : undefined;
	if (region) entry.region = region.slug;
	const icon = r.profileIconId;
	if (typeof icon === 'number' && Number.isInteger(icon) && icon >= 0) entry.profileIconId = icon;
	if (typeof r.rank === 'string' && r.rank !== '') entry.rank = r.rank;
	const viewedAt = r.viewedAt;
	if (typeof viewedAt === 'number' && Number.isFinite(viewedAt) && viewedAt > 0) {
		entry.viewedAt = viewedAt;
	}
	return [entry];
}

/**
 * Reads a stored list, ignoring anything malformed: an entry without a Riot
 * ID is dropped, any other field that is not well-formed is left out of its
 * entry. Entries stored before FP-03 hold a Riot ID only; those from before
 * profiles lost their region (ADR-037) carry the region the profile loaded
 * with, which is kept when known. A player stored twice is kept once, the
 * newest copy.
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
		.flatMap(parseEntry)
		.reduceRight<RecentSearch[]>((list, entry) => addRecent(list, entry), [])
		.slice(0, MAX_RECENT);
}
