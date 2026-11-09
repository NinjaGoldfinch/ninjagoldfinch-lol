// Records one riot-proxy response as a test fixture. Each run spends real
// Riot rate limit, so record only what a test needs.
//
//   just fixture <name> <path> [--keep ids]
//
// --keep trims Data Dragon files: only entries under `data` whose key, or
// whose own `key` field, is in the comma-separated list are kept. Use it for
// /v1/static/{champion,item,summoner}, which are hundreds of kB in full. For a
// body that is a list, it keeps the entries whose `id` is in the list.
//
// A full URL instead of a path records from that host, for the little the site
// reads from CommunityDragon. The fixture is keyed by the URL's path: the mock
// serves it when CDRAGON_URL points at the mock.
//
// Redaction: Riot's player ids, in the body and in the path, are replaced by
// stable placeholders (see redact.ts). Only the headers the site reads are kept.

import { existsSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Fixture } from './mock-proxy/mock.ts';
import { createRedactor } from './redact.ts';

const [name, path, flag, keepList] = process.argv.slice(2);
const absolute = /^https?:\/\//.test(path ?? '');
if (
	!name ||
	!(path?.startsWith('/') || absolute) ||
	(flag !== undefined && (flag !== '--keep' || !keepList))
) {
	console.error(
		'usage: node tests/record-fixture.ts <name> </path?query | https://url> [--keep id,id,...]'
	);
	process.exit(1);
}
const keep = keepList ? new Set(keepList.split(',')) : undefined;

if (existsSync('.env')) process.loadEnvFile('.env');
const { PROXY_URL, PROXY_KEY } = process.env;
if (!PROXY_URL) throw new Error('PROXY_URL is not set');

const KEEP_HEADERS = [
	'content-type',
	'x-cache',
	'x-cache-age',
	'x-cache-fetched-age',
	'x-request-id',
	'retry-after'
];
const { redact, placeholders } = createRedactor();

const url = new URL(path, PROXY_URL);
// The proxy key goes to riot-proxy only.
const response = await fetch(url, {
	headers: PROXY_KEY && !absolute ? { Authorization: `Bearer ${PROXY_KEY}` } : {}
});
const text = await response.text();
const body = trim(redact(text ? JSON.parse(text) : null));

function trim(value: unknown): unknown {
	if (keep && Array.isArray(value)) {
		return value.filter((entry: { id?: unknown }) => keep.has(String(entry?.id)));
	}
	if (!keep || typeof value !== 'object' || value === null || !('data' in value)) return value;
	const data = Object.entries(value.data as Record<string, { key?: string }>).filter(
		([k, entry]) => keep.has(k) || (entry.key !== undefined && keep.has(entry.key))
	);
	return { ...value, data: Object.fromEntries(data) };
}

let recordedPath = absolute ? url.pathname + url.search : path;
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
