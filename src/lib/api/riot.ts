// Riot's own payloads, which riot-proxy passes through unmodified and its
// spec leaves untyped. Only the fields the site uses, from Riot's published
// DTOs, checked at runtime. See ADR-006.

/** account-v1 AccountDto. Riot documents gameName and tagLine as optional. */
export interface Account {
	puuid: string;
	gameName?: string;
	tagLine?: string;
}

export function parseAccount(value: unknown): Account | undefined {
	if (typeof value !== 'object' || value === null) return undefined;
	const { puuid, gameName, tagLine } = value as Record<string, unknown>;
	if (typeof puuid !== 'string') return undefined;
	if (gameName !== undefined && typeof gameName !== 'string') return undefined;
	if (tagLine !== undefined && typeof tagLine !== 'string') return undefined;
	return { puuid, gameName, tagLine };
}

/** summoner-v4 SummonerDto: the fields the site uses. */
export interface Summoner {
	profileIconId: number;
	summonerLevel: number;
}

export function parseSummoner(value: unknown): Summoner | undefined {
	if (typeof value !== 'object' || value === null) return undefined;
	const { profileIconId, summonerLevel } = value as Record<string, unknown>;
	if (typeof profileIconId !== 'number' || typeof summonerLevel !== 'number') return undefined;
	return { profileIconId, summonerLevel };
}

/** league-v4 LeagueEntryDto: the fields the site uses. */
export interface LeagueEntry {
	queueType: string;
	tier: string;
	rank: string;
	leaguePoints: number;
	wins: number;
	losses: number;
}

/** Riot's league entries for a player; entries of the wrong shape are dropped. */
export function parseLeagueEntries(value: unknown): LeagueEntry[] | undefined {
	if (!Array.isArray(value)) return undefined;
	return value.flatMap((entry): LeagueEntry[] => {
		if (typeof entry !== 'object' || entry === null) return [];
		const { queueType, tier, rank, leaguePoints, wins, losses } = entry as Record<string, unknown>;
		return typeof queueType === 'string' &&
			typeof tier === 'string' &&
			typeof rank === 'string' &&
			typeof leaguePoints === 'number' &&
			typeof wins === 'number' &&
			typeof losses === 'number'
			? [{ queueType, tier, rank, leaguePoints, wins, losses }]
			: [];
	});
}
