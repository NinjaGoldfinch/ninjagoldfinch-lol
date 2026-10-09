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
