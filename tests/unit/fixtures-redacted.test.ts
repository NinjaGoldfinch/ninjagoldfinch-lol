import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

// CLAUDE.md: fixtures are redacted, and no key appears anywhere in the repo.
// The pre-commit hook checks only lines being added; this checks every file.

const DIR = join(import.meta.dirname, '../fixtures');
const files = (readdirSync(DIR, { recursive: true }) as string[])
	.filter((f) => f.endsWith('.json'))
	.map((f) => join(DIR, f));

/** A riot-proxy or Riot key: the prefix and a key character, as the pre-commit hook matches. */
const KEY = /(rpx_|RGAPI-)[A-Za-z0-9_-]/;
/** What `tests/redact.ts` writes, and riot-proxy's build fixtures' own placeholders. */
const PLACEHOLDER = /^(bld-)?fixture-(puuid|summoner)-/;
/** A real PUUID: 78 characters of base64url. */
const RAW_PUUID = /[A-Za-z0-9_-]{78}/;

/** Every player id in a body: `puuid`, `summonerId`, and `metadata.participants`. */
function playerIds(value: unknown, key?: string, parent?: string): string[] {
	if (typeof value === 'string') {
		return key === 'puuid' || key === 'summonerId' ? [value] : [];
	}
	if (Array.isArray(value)) {
		if (key === 'participants' && parent === 'metadata') {
			return value.filter((v): v is string => typeof v === 'string');
		}
		return value.flatMap((v) => playerIds(v, undefined, key));
	}
	if (typeof value !== 'object' || value === null) return [];
	return Object.entries(value).flatMap(([k, v]) => playerIds(v, k, key));
}

describe('fixtures', () => {
	it('are all found', () => {
		expect(files.length).toBeGreaterThan(40);
	});

	it.each(files.map((f) => [relative(DIR, f), f]))('%s holds no key', (_, file) => {
		expect(readFileSync(file, 'utf8')).not.toMatch(KEY);
	});

	it.each(files.map((f) => [relative(DIR, f), f]))(
		'%s holds only placeholder player ids',
		(_, file) => {
			const text = readFileSync(file, 'utf8');
			expect(text).not.toMatch(RAW_PUUID);
			for (const id of playerIds(JSON.parse(text))) expect(id).toMatch(PLACEHOLDER);
		}
	);
});
