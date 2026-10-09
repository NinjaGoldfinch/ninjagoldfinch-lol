import { findFixture, loadFixtures } from '../mock-proxy/mock.ts';

/** The recorded body for a path, for unit tests that shape proxy data. */
export function fixtureBody(path: string): unknown {
	const fixture = findFixture(loadFixtures(), 'GET', path);
	if (!fixture) throw new Error(`no fixture for ${path}`);
	return fixture.response.body;
}

export const PROFILE_PATH = '/v1/players/by-riot-id/NinjaGoldfinch/OCENZ/profile?platform=oc1';
export const MATCHES_PATH =
	'/v1/players/fixture-puuid-4f3f29f89c01d123/matches?platform=oc1&count=10';
