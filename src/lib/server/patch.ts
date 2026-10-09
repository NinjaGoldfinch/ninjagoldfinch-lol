import { error } from '@sveltejs/kit';
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

/** The current patch. riot-proxy answers this from its mirror, not from Riot. */
export async function currentPatch(client: ProxyClient = proxy): Promise<string> {
	const { data, error: apiError, response } = await client.GET('/v1/static/versions');
	if (!response.ok) toHttpError(response, apiError);

	const patch = pickPatch(data);
	if (!patch) {
		console.error('unexpected /v1/static/versions payload');
		error(503, 'Temporarily unavailable');
	}
	return patch;
}
