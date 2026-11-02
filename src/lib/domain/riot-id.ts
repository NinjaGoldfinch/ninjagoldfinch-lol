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

/**
 * The profile URL for a Riot ID. A Riot ID plays on one platform, which
 * riot-proxy finds from the account, so the URL names no region. ADR-037.
 */
export function profilePath(id: RiotId): string {
	return `/summoner/${encodeURIComponent(`${id.gameName}-${id.tagLine}`)}`;
}

/** `name#tag` in lower case: the same for every casing of one Riot ID. */
export function riotIdKey(id: RiotId): string {
	return `${id.gameName}#${id.tagLine}`.toLowerCase();
}

/** Riot IDs compare without regard to case, as Riot looks them up. */
export function sameRiotId(a: RiotId, b: RiotId): boolean {
	return riotIdKey(a) === riotIdKey(b);
}

/** The spec's lengths: a game name of 1–16 characters, a tag line of 1–5. */
const GAME_NAME_MAX = 16;
const TAG_LINE_MAX = 5;

/**
 * Whether a part can go into a riot-proxy path as it is. The client encodes
 * `/` but not dots, so `.` or `..` would move the request to another route.
 */
function validPart(part: string, max: number): boolean {
	const length = [...part].length;
	return length >= 1 && length <= max && part !== '.' && part !== '..';
}

function split(value: string, separator: string): RiotId | undefined {
	const at = value.lastIndexOf(separator);
	if (at === -1) return undefined;

	const gameName = value.slice(0, at).trim();
	const tagLine = value.slice(at + 1).trim();
	return validPart(gameName, GAME_NAME_MAX) && validPart(tagLine, TAG_LINE_MAX)
		? { gameName, tagLine }
		: undefined;
}
