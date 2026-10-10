/** riot-proxy's regional routing values (spec: "americas, europe, asia or sea"). */
export type RegionalRoute = 'americas' | 'europe' | 'asia' | 'sea';

/** A region a visitor can pick, keyed by the lower-case slug used in URLs. */
export interface Region {
	slug: string;
	label: string;
	/** Platform routing value, e.g. `oc1`. */
	platform: string;
	/** Regional routing value for account and match routes. */
	route: RegionalRoute;
}

/** Every public League of Legends platform, by label. */
export const REGIONS: readonly Region[] = [
	{ slug: 'br', label: 'Brazil', platform: 'br1', route: 'americas' },
	{ slug: 'eune', label: 'Europe Nordic & East', platform: 'eun1', route: 'europe' },
	{ slug: 'euw', label: 'Europe West', platform: 'euw1', route: 'europe' },
	{ slug: 'jp', label: 'Japan', platform: 'jp1', route: 'asia' },
	{ slug: 'kr', label: 'Korea', platform: 'kr', route: 'asia' },
	{ slug: 'lan', label: 'Latin America North', platform: 'la1', route: 'americas' },
	{ slug: 'las', label: 'Latin America South', platform: 'la2', route: 'americas' },
	{ slug: 'me', label: 'Middle East', platform: 'me1', route: 'europe' },
	{ slug: 'na', label: 'North America', platform: 'na1', route: 'americas' },
	{ slug: 'oce', label: 'Oceania', platform: 'oc1', route: 'sea' },
	{ slug: 'ru', label: 'Russia', platform: 'ru', route: 'europe' },
	{ slug: 'sea', label: 'Southeast Asia', platform: 'sg2', route: 'sea' },
	{ slug: 'tw', label: 'Taiwan', platform: 'tw2', route: 'sea' },
	{ slug: 'tr', label: 'Türkiye', platform: 'tr1', route: 'europe' },
	{ slug: 'vn', label: 'Vietnam', platform: 'vn2', route: 'sea' }
];

export const DEFAULT_REGION = 'oce';

export function findRegion(slug: string): Region | undefined {
	const wanted = slug.toLowerCase();
	return REGIONS.find((region) => region.slug === wanted);
}

/** The region for a platform routing value, as riot-proxy reports a player's (`oc1`). */
export function regionForPlatform(platform: string): Region | undefined {
	const wanted = platform.toLowerCase();
	return REGIONS.find((region) => region.platform === wanted);
}

/** The region a Riot match id names in its prefix: `OC1_712351051` is Oceania's. */
export function regionForMatchId(matchId: string): Region | undefined {
	const prefix = /^([A-Za-z0-9]+)_[0-9]+$/.exec(matchId)?.[1];
	return prefix ? regionForPlatform(prefix) : undefined;
}
