// The only place image URLs are built. Images come from Riot's Data Dragon
// CDN, keyed by patch version; riot-proxy mirrors Data Dragon's JSON but not
// its images. A CDN or path change is an edit to this file only.

const DDRAGON = 'https://ddragon.leagueoflegends.com/cdn';

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
