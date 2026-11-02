import { readdirSync, readFileSync } from 'node:fs';
import { createServer, type Server } from 'node:http';
import { join } from 'node:path';

/** One recorded riot-proxy exchange. `path` is the request path and query, as sent. */
export interface Fixture {
	request: { method: string; path: string };
	response: { status: number; headers: Record<string, string>; body: unknown };
}

const FIXTURES_DIR = join(import.meta.dirname, '../fixtures');

export function loadFixtures(dir = FIXTURES_DIR): Fixture[] {
	return readdirSync(dir)
		.filter((file) => file.endsWith('.json'))
		.map((file) => JSON.parse(readFileSync(join(dir, file), 'utf8')) as Fixture);
}

export function findFixture(
	fixtures: Fixture[],
	method: string,
	path: string
): Fixture | undefined {
	return fixtures.find((f) => f.request.method === method && f.request.path === path);
}

/**
 * A stand-in for riot-proxy that replays fixtures. A request with no fixture
 * gets a 500 and a log line, so a missing fixture fails loudly instead of
 * looking like "not found".
 */
export function createMockProxy(fixtures: Fixture[]): Server {
	return createServer((req, res) => {
		const method = req.method ?? 'GET';
		const path = req.url ?? '/';
		const fixture = findFixture(fixtures, method, path);

		if (!fixture) {
			console.error(`mock-proxy: no fixture for ${method} ${path}`);
			res.writeHead(500, { 'content-type': 'application/json' });
			res.end(JSON.stringify({ error: { code: 'INTERNAL', message: `no fixture for ${path}` } }));
			return;
		}

		res.writeHead(fixture.response.status, fixture.response.headers);
		res.end(JSON.stringify(fixture.response.body));
	});
}
