import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { VERSION } from '#lib/server/version.ts';
import { GET } from '../../src/routes/healthz/+server.ts';

const pkg: unknown = JSON.parse(readFileSync('package.json', 'utf8'));

describe('/healthz', () => {
	it('reports the version in package.json', () => {
		expect(pkg).toMatchObject({ version: VERSION });
	});

	// ninja-deploy compares the version in the body with the tag it activated, so it
	// must be a plain semver that a v-prefixed tag can match.
	it('reports a version a release tag can match', () => {
		expect(`v${VERSION}`).toMatch(/^v\d+\.\d+\.\d+(-[0-9A-Za-z.]+)?$/);
	});

	it('answers ok with the version, uncached', async () => {
		const response = await GET({} as Parameters<typeof GET>[0]);
		expect(response.status).toBe(200);
		expect(response.headers.get('cache-control')).toBe('no-store');
		expect(await response.json()).toEqual({ ok: true, version: VERSION });
	});

	// ninja-deploy reads the version with sed from a one-line body.
	it('answers on one line, version as a string', async () => {
		const body = await (await GET({} as Parameters<typeof GET>[0])).text();
		expect(body).not.toContain('\n');
		expect(body).toMatch(new RegExp(`"version" *: *"${VERSION.replaceAll('.', '\\.')}"`));
	});
});
