// The only place image URLs are built. Images come from Riot's Data Dragon
// CDN, keyed by patch version. riot-proxy also mirrors Data Dragon's images,
// but only inside the host, so the browser can't reach them (ADR-018).
// CommunityDragon fills what Data Dragon lacks (lane icons, stat shards). A
// CDN or path change is an edit to this file only. ADR-009, ADR-015, ADR-026.

import { LANES } from '#lib/domain/champion-stats.ts';

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

/**
 * A stat shard's icon from CommunityDragon. `icon` is the path inside its
 * game data, as `parseStatShards` reduces perks.json's `iconPath`.
 */
export function statShardIconUrl(patch: string, icon: string): string {
	return `${cdragonGameData(patch)}/${icon.split('/').map(segment).join('/')}`;
}

/**
 * CommunityDragon's copy of the client's game data for a patch, pinned to its
 * `major.minor`. `base` is for the server, which may use a mirror (CDRAGON_URL).
 */
export function cdragonGameData(patch: string, base = CDRAGON): string {
	return `${base}/${segment(majorMinor(patch))}/plugins/rcp-be-lol-game-data/global/default/v1`;
}

function majorMinor(patch: string): string {
	return patch.split('.').slice(0, 2).join('.');
}

/**
 * The client's lane icon, from CommunityDragon pinned to the patch's
 * `major.minor`. `position` is Riot's teamPosition; undefined if not a lane.
 */
export function laneIconUrl(patch: string, position: string): string | undefined {
	if (!(position in LANES)) return undefined;
	return `${CDRAGON}/${segment(majorMinor(patch))}/plugins/rcp-fe-lol-clash/global/default/assets/images/position-selector/positions/icon-position-${position.toLowerCase()}.png`;
}
