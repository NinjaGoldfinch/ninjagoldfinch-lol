// Riot's own payloads. riot-proxy passes them through verbatim and, since
// riot-proxy #133, declares them in its spec (AccountDto, SummonerDTO,
// LeagueEntryDTO, …), so the site uses the generated types. ADR-018.

import type { components } from './schema.d.ts';

type Schemas = components['schemas'];

export type Account = Schemas['AccountDto'];

/** The summoner fields the profile shows. */
export type Summoner = Pick<Schemas['SummonerDTO'], 'profileIconId' | 'summonerLevel'>;

/** The league entry fields the profile shows. */
export type LeagueEntry = Pick<
	Schemas['LeagueEntryDTO'],
	'queueType' | 'tier' | 'rank' | 'leaguePoints' | 'wins' | 'losses'
>;

export function toSummoner(dto: Schemas['SummonerDTO'] | null): Summoner | null {
	return dto && { profileIconId: dto.profileIconId, summonerLevel: dto.summonerLevel };
}

export function toLeagueEntries(dtos: Schemas['LeagueEntryDTO'][] | null): LeagueEntry[] | null {
	return (
		dtos?.map(({ queueType, tier, rank, leaguePoints, wins, losses }) => ({
			queueType,
			tier,
			rank,
			leaguePoints,
			wins,
			losses
		})) ?? null
	);
}
