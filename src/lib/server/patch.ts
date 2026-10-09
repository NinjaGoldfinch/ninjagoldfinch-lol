import { error } from '@sveltejs/kit';
import { patchOf } from '#lib/domain/matches.ts';
import { proxy } from './proxy.ts';
import { toHttpError } from './errors.ts';

type ProxyClient = typeof proxy;

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

/**
 * The current patch, and Riot's version list for matching older games.
 * riot-proxy answers this from its mirror, not from Riot.
 */
export async function patchVersions(
	client: ProxyClient = proxy
): Promise<{ current: string; versions: string[] }> {
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
