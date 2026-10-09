// Records one riot-proxy response as a test fixture. Each run spends real
// Riot rate limit, so record only what a test needs.
//
//   just fixture <name> <path> [--keep ids]
//
// --keep trims Data Dragon files: only entries under `data` whose key, or
// whose own `key` field, is in the comma-separated list are kept. Use it for
// /v1/static/{champion,item,summoner}, which are hundreds of kB in full.
//
// Redaction: every `puuid` value, in the body and in the path, is replaced by
// a stable placeholder derived from it, so fixtures recorded separately still
// agree with each other. Only the headers the site reads are kept.

import { createHash } from 'node:crypto';
import { existsSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Fixture } from './mock-proxy/mock.ts';

const [name, path, flag, keepList] = process.argv.slice(2);
if (!name || !path?.startsWith('/') || (flag !== undefined && (flag !== '--keep' || !keepList))) {
	console.error('usage: node tests/record-fixture.ts <name> </path?query> [--keep id,id,...]');
	process.exit(1);
}
const keep = keepList ? new Set(keepList.split(',')) : undefined;

if (existsSync('.env')) process.loadEnvFile('.env');
const { PROXY_URL, PROXY_KEY } = process.env;
if (!PROXY_URL) throw new Error('PROXY_URL is not set');

const KEEP_HEADERS = ['content-type', 'x-cache', 'x-cache-age', 'x-request-id', 'retry-after'];
const placeholders = new Map<string, string>();

function placeholder(puuid: string): string {
	const hash = createHash('sha256').update(puuid).digest('hex').slice(0, 16);
	const value = `fixture-puuid-${hash}`;
	placeholders.set(puuid, value);
	return value;
}

function redact(value: unknown): unknown {
	if (Array.isArray(value)) return value.map(redact);
	if (typeof value !== 'object' || value === null) return value;
	return Object.fromEntries(
		Object.entries(value).map(([k, v]) => [
			k,
			k === 'puuid' && typeof v === 'string' ? placeholder(v) : redact(v)
		])
	);
}

const response = await fetch(new URL(path, PROXY_URL), {
	headers: PROXY_KEY ? { Authorization: `Bearer ${PROXY_KEY}` } : {}
});
const text = await response.text();
const body = trim(redact(text ? JSON.parse(text) : null));

function trim(value: unknown): unknown {
	if (!keep || typeof value !== 'object' || value === null || !('data' in value)) return value;
	const data = Object.entries(value.data as Record<string, { key?: string }>).filter(
		([k, entry]) => keep.has(k) || (entry.key !== undefined && keep.has(entry.key))
	);
	return { ...value, data: Object.fromEntries(data) };
}

let recordedPath = path;
for (const [real, fake] of placeholders) recordedPath = recordedPath.replaceAll(real, fake);

const fixture: Fixture = {
	request: { method: 'GET', path: recordedPath },
	response: {
		status: response.status,
		headers: Object.fromEntries(
			KEEP_HEADERS.flatMap((h) => {
				const v = response.headers.get(h);
				return v === null ? [] : [[h, v]];
			})
		),
		body
	}
};

const file = join('tests/fixtures', `${name}.json`);
writeFileSync(file, JSON.stringify(fixture, null, '\t') + '\n');
console.log(`${response.status} ${path} -> ${file}`);
