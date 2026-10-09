// The only place image URLs are built. Images come from Riot's Data Dragon
// CDN, keyed by patch version; riot-proxy mirrors Data Dragon's JSON but not
// its images. CommunityDragon fills what Data Dragon lacks (lane icons). A CDN
// or path change is an edit to this file only. ADR-009, ADR-015.

const DDRAGON = 'https://ddragon.leagueoflegends.com/cdn';
const CDRAGON = 'https://raw.communitydragon.org';

const segment = (value: string | number) => encodeURIComponent(String(value));

/** `id` is Data Dragon's champion id (e.g. `MonkeyKing`), not the display name. */
export function championIconUrl(patch: string, id: string): string {
	return `${DDRAGON}/${segment(patch)}/img/champion/${segment(id)}.png`;
}

export function itemIconUrl(patch: string, itemId: number): string {
	return `${DDRAGON}/${segment(patch)}/img/item/${segment(itemId)}.png`;
}

export function profileIconUrl(patch: string, iconId: number): string {
	return `${DDRAGON}/${segment(patch)}/img/profileicon/${segment(iconId)}.png`;
}

/** `id` is Data Dragon's summoner spell id (e.g. `SummonerFlash`). */
export function summonerSpellIconUrl(patch: string, id: string): string {
	return `${DDRAGON}/${segment(patch)}/img/spell/${segment(id)}.png`;
}

/** `icon` is a rune's path from runesReforged.json; rune images are not versioned. */
export function runeIconUrl(icon: string): string {
	return `${DDRAGON}/img/${icon.split('/').map(segment).join('/')}`;
}

/** Riot's teamPosition values, as the site names them. */
export const LANES: Record<string, string> = {
	TOP: 'Top',
	JUNGLE: 'Jungle',
	MIDDLE: 'Mid',
	BOTTOM: 'Bot',
	UTILITY: 'Support'
};

/**
 * The client's lane icon, from CommunityDragon pinned to the patch's
 * `major.minor`. `position` is Riot's teamPosition; undefined if not a lane.
 */
export function laneIconUrl(patch: string, position: string): string | undefined {
	if (!(position in LANES)) return undefined;
	const version = patch.split('.').slice(0, 2).join('.');
	return `${CDRAGON}/${segment(version)}/plugins/rcp-fe-lol-clash/global/default/assets/images/position-selector/positions/icon-position-${position.toLowerCase()}.png`;
}
