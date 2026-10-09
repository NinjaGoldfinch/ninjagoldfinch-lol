/** A Riot ID: game name plus tag line, as Riot spells them. */
export interface RiotId {
	gameName: string;
	tagLine: string;
}

/** Parses what a visitor types: `Game Name#TAG`. */
export function parseRiotIdInput(input: string): RiotId | undefined {
	return split(input, '#');
}

/**
 * Parses the profile URL segment, `GameName-TAG` (already URL-decoded).
 * Splits on the last hyphen, since tag lines cannot contain one.
 */
export function parseRiotId(segment: string): RiotId | undefined {
	return split(segment, '-');
}

/** The profile URL for a Riot ID in a region. */
export function profilePath(region: string, id: RiotId): string {
	return `/summoner/${region}/${encodeURIComponent(`${id.gameName}-${id.tagLine}`)}`;
}

/** Riot IDs compare without regard to case, as Riot looks them up. */
export function sameRiotId(a: RiotId, b: RiotId): boolean {
	const key = (id: RiotId) => `${id.gameName}#${id.tagLine}`.toLowerCase();
	return key(a) === key(b);
}

function split(value: string, separator: string): RiotId | undefined {
	const at = value.lastIndexOf(separator);
	if (at === -1) return undefined;

	const gameName = value.slice(0, at).trim();
	const tagLine = value.slice(at + 1).trim();
	return gameName && tagLine ? { gameName, tagLine } : undefined;
}
