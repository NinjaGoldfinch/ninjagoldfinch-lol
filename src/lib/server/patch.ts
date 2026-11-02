import { error } from '@sveltejs/kit';
import { patchOf } from '#lib/domain/matches.ts';
import { proxy, type ProxyClient } from './proxy.ts';
import { toHttpError } from './errors.ts';

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

/** How long the version list is held. riot-proxy's mirror moves about once a patch. */
export const PATCH_TTL_MS = 5 * 60 * 1000;

// Every page asks for the current patch, which changes about every two weeks,
// so one answer is shared for a few minutes, as ADR-013 holds the lookups.
let held: { at: number; versions: Promise<PatchVersions> } | undefined;

/**
 * The current patch, and Riot's version list for matching older games.
 * riot-proxy answers this from its mirror, not from Riot. Held for
 * PATCH_TTL_MS and shared by concurrent callers; a failure is not kept.
 */
export function patchVersions(client: ProxyClient = proxy): Promise<PatchVersions> {
	if (held && Date.now() - held.at < PATCH_TTL_MS) return held.versions;

	const versions = fetchVersions(client);
	held = { at: Date.now(), versions };
	versions.catch(() => {
		if (held?.versions === versions) held = undefined;
	});
	return versions;
}

/** For tests: forget the held versions. */
export function clearPatchVersions(): void {
	held = undefined;
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
export async function currentPatch(client: ProxyClient = proxy): Promise<string> {
	return (await patchVersions(client)).current;
}
