import { describe, expect, it } from 'vitest';
import { BUILD, buildInfo } from '#lib/server/version.ts';
import { GET } from '../../src/routes/api/version/+server.ts';

const at = '2026-11-05T09:12:00Z';

describe('buildInfo', () => {
	it('reports what scripts/package.sh injected', () => {
		expect(buildInfo({ version: '1.0.4', commit: 'a1b2c3d', builtAt: at })).toEqual({
			version: '1.0.4',
			commit: 'a1b2c3d',
			built_at: at
		});
	});

	it('reports dev for any other build', () => {
		const dev = { version: 'dev', commit: 'dev', built_at: at };
		expect(buildInfo({ builtAt: at })).toEqual(dev);
		expect(buildInfo({ version: '', commit: ' ', builtAt: at })).toEqual(dev);
		// Half an identity is no identity: a version without its commit says nothing.
		expect(buildInfo({ version: '1.0.4', builtAt: at })).toEqual(dev);
		expect(buildInfo({ commit: 'a1b2c3d', builtAt: at })).toEqual(dev);
	});

	it('bakes in a build time, RFC 3339 in UTC to the second', () => {
		expect(BUILD.built_at).toMatch(/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\dZ$/);
	});
});

describe('/api/version', () => {
	const get = () => GET({} as Parameters<typeof GET>[0]);

	it('answers the version and commit only, uncached', async () => {
		const response = await get();
		expect(response.status).toBe(200);
		expect(response.headers.get('cache-control')).toBe('no-store');
		expect(await response.json()).toEqual({ version: BUILD.version, commit: BUILD.commit });
	});

	it('reports dev outside a release build', async () => {
		expect(await (await get()).json()).toEqual({ version: 'dev', commit: 'dev' });
	});
});
