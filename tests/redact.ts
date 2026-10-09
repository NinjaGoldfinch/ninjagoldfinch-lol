// Redaction for recorded fixtures. Riot's player ids are replaced by stable
// placeholders derived from them, so fixtures recorded separately still agree
// with each other:
//
// - every `puuid` value;
// - every `summonerId` value (Riot's encrypted summoner id);
// - `metadata.participants` in match-v5 matches and timelines, a list of puuids.

import { createHash } from 'node:crypto';

export function createRedactor() {
	/** Real id -> placeholder, for rewriting the request path too. */
	const placeholders = new Map<string, string>();

	function placeholder(kind: 'puuid' | 'summoner', id: string): string {
		const hash = createHash('sha256').update(id).digest('hex').slice(0, 16);
		const value = `fixture-${kind}-${hash}`;
		placeholders.set(id, value);
		return value;
	}

	function redactEntry(key: string, value: unknown, parent: string | undefined): unknown {
		if (typeof value === 'string' && key === 'puuid') return placeholder('puuid', value);
		if (typeof value === 'string' && key === 'summonerId') return placeholder('summoner', value);
		if (parent === 'metadata' && key === 'participants' && Array.isArray(value)) {
			return value.map((v) => (typeof v === 'string' ? placeholder('puuid', v) : redact(v)));
		}
		return redact(value, key);
	}

	function redact(value: unknown, key?: string): unknown {
		if (Array.isArray(value)) return value.map((v) => redact(v));
		if (typeof value !== 'object' || value === null) return value;
		return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, redactEntry(k, v, key)]));
	}

	return { redact: (value: unknown) => redact(value), placeholders };
}
