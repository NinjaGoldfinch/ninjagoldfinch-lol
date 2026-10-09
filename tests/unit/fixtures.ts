import {
	parseItemNames,
	parseKeyedNames,
	parseQueueNames,
	parseRunes,
	type StaticNames
} from '#lib/api/ddragon.ts';
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
export const MATCH_PATH = '/v1/lol/matches/sea/OC1_712351051';
export const TIMELINE_PATH = '/v1/lol/matches/sea/OC1_712351051/timeline';

/** The static lookups for patch 16.20.1, from the recorded (trimmed) Data Dragon files. */
export function recordedNames(): StaticNames {
	return {
		champions: parseKeyedNames(fixtureBody('/v1/static/champion?version=16.20.1')),
		items: parseItemNames(fixtureBody('/v1/static/item?version=16.20.1')),
		spells: parseKeyedNames(fixtureBody('/v1/static/summoner?version=16.20.1')),
		queues: parseQueueNames(fixtureBody('/v1/static/queues')),
		runes: parseRunes(fixtureBody('/v1/static/runesReforged?version=16.20.1'))
	};
}
