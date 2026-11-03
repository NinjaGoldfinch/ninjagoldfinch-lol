import { error } from '@sveltejs/kit';
import { patchOf } from '#lib/domain/matches.ts';
import { proxy, type ProxyClient } from './proxy.ts';
import { statShards } from './cdragon.ts';
import { toHttpError } from './errors.ts';
import { staticNames } from './static-data.ts';
import { outsideLoad } from './timing.ts';

// Patch versions are dotted numbers (riot-proxy's own `version` pattern),
// which also keeps them safe to put in asset URLs.
const PATCH = /^[0-9]+(\.[0-9]+)*$/;

/**
 * Picks the patch to build asset URLs for from `/v1/static/versions`:
 * the mirrored patch, or Riot's newest before the first mirror sync.
 */
export function pickPatch(body: unknown): string | undefined {
	if (typeof body !== 'object' || body === null) return undefined;
	const { current, versions } = body as Record<string, unknown>;
	const newest = Array.isArray(versions) ? versions[0] : undefined;
	const patch = typeof current === 'string' ? current : newest;
	return typeof patch === 'string' && PATCH.test(patch) ? patch : undefined;
}

/** Riot's Data Dragon versions from `/v1/static/versions`, newest first. */
export function pickVersions(body: unknown): string[] {
	const versions = typeof body === 'object' && body !== null && 'versions' in body && body.versions;
	return Array.isArray(versions)
		? versions.filter((v): v is string => typeof v === 'string' && PATCH.test(v))
		: [];
}

/**
 * The Data Dragon version for a game build such as `16.20.824.8524`: the
 * newest with the same `major.minor`, as riot-proxy picks `ddragonVersion`
 * for its match summaries. undefined if the list lacks that patch.
 */
export function ddragonVersionFor(
	versions: string[],
	gameVersion: string | null
): string | undefined {
	const patch = patchOf(gameVersion);
	return patch ? versions.find((v) => v === patch || v.startsWith(`${patch}.`)) : undefined;
}

type PatchVersions = { current: string; versions: string[] };

/** Loads what pages need for a patch before they are switched to it. */
export type PreparePatch = (patch: string, client: ProxyClient) => Promise<unknown>;

/**
 * A patch's Data Dragon lookups, which pages need, held once loaded. Its stat
 * shards start loading too but don't hold back the switch: match pages do
 * without them, and CommunityDragon can publish a new patch later than
 * riot-proxy mirrors it.
 */
export const preparePatch: PreparePatch = (patch, client) => {
	statShards(patch).catch(() => undefined);
	return staticNames(patch, client);
};

/** How long the version list is used before it is refreshed. riot-proxy's mirror moves about once a patch. */
export const PATCH_TTL_MS = 5 * 60 * 1000;

// Every page asks for the current patch, which changes about every two
// weeks. The answer is held (ADR-041), and once it is older than
// PATCH_TTL_MS it is still served at once while one refresh runs in the
// background (ADR-048). A new patch is switched to only when its lookups have
// loaded, so a page never mixes two patches' names and icons.
let held: { at: number; versions: PatchVersions } | undefined;
/** The first fetch, before anything is held; concurrent callers share it. */
let cold: Promise<PatchVersions> | undefined;
let refreshing: Promise<void> | undefined;
/** Bumped by clearPatchVersions, so a refresh started before it changes nothing. */
let generation = 0;

/**
 * The current patch, and Riot's version list for matching older games.
 * riot-proxy answers this from its mirror, not from Riot. Only the first call,
 * with nothing held, waits for riot-proxy; a failure then is not kept.
 */
export function patchVersions(
	client: ProxyClient = proxy,
	prepare: PreparePatch = preparePatch
): Promise<PatchVersions> {
	if (held) {
		if (Date.now() - held.at >= PATCH_TTL_MS) refresh(client, prepare);
		return Promise.resolve(held.versions);
	}
	if (!cold) {
		const started = generation;
		const versions = fetchVersions(client);
		cold = versions;
		versions.then(
			(v) => {
				if (generation === started && !held) held = { at: Date.now(), versions: v };
			},
			() => undefined
		);
		const done = () => {
			if (cold === versions) cold = undefined;
		};
		versions.then(done, done);
	}
	return cold;
}

/**
 * Fetches the versions again without making anyone wait. On a new patch,
 * its lookups load first; only then do pages move to it. A failure keeps
 * the held patch, and the next request tries again.
 */
function refresh(client: ProxyClient, prepare: PreparePatch): void {
	if (refreshing) return;
	const started = generation;
	// Detached from the request that noticed the stale patch: it doesn't wait.
	refreshing = outsideLoad(async () => {
		try {
			const next = await fetchVersions(client);
			const current = held?.versions.current;
			if (next.current !== current) await prepare(next.current, client);
			if (generation === started) held = { at: Date.now(), versions: next };
		} catch (e) {
			console.error(`patch refresh failed; keeping ${held?.versions.current ?? 'none'}:`, e);
		} finally {
			if (generation === started) refreshing = undefined;
		}
	});
}

/**
 * At start-up: the current patch, its lookups and its stat shards, so the
 * first visitor after a deploy doesn't wait for them (SPD-09). A failure is
 * logged, not thrown: the first page tries again.
 */
export async function warmPatch(
	client: ProxyClient = proxy,
	prepare: PreparePatch = preparePatch
): Promise<void> {
	try {
		const { current } = await patchVersions(client, prepare);
		await prepare(current, client);
	} catch (e) {
		console.error('start-up warm of the current patch failed:', e);
	}
}

/** For tests: forget the held versions and any refresh in flight. */
export function clearPatchVersions(): void {
	generation += 1;
	held = undefined;
	cold = undefined;
	refreshing = undefined;
}

/** For tests: the refresh in flight, if any. */
export function patchRefresh(): Promise<void> | undefined {
	return refreshing;
}

async function fetchVersions(client: ProxyClient): Promise<PatchVersions> {
	const { data, error: apiError, response } = await client.GET('/v1/static/versions');
	if (!response.ok) toHttpError(response, apiError);

	const current = pickPatch(data);
	if (!current) {
		console.error('unexpected /v1/static/versions payload');
		error(503, 'Temporarily unavailable');
	}
	return { current, versions: pickVersions(data) };
}

/** The current patch. riot-proxy answers this from its mirror, not from Riot. */
export async function currentPatch(
	client: ProxyClient = proxy,
	prepare: PreparePatch = preparePatch
): Promise<string> {
	return (await patchVersions(client, prepare)).current;
}
