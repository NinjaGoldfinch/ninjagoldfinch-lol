import { building } from '$app/env';
import { STATUS_CHECK_INTERVAL_S } from '$app/env/private';
import type { Handle, HandleServerError, ServerInit } from '@sveltejs/kit/hooks';
import { CACHE_POLICIES, responseCachePolicy } from '#lib/server/cache.ts';
import { countRequest } from '#lib/server/metrics.ts';
import { warmPatch } from '#lib/server/patch.ts';
import { probeClient } from '#lib/server/proxy.ts';
import { setSecurityHeaders } from '#lib/server/security.ts';
import { startChecks } from '#lib/server/status.ts';
import { timeLoad } from '#lib/server/timing.ts';
import { BUILD } from '#lib/server/version.ts';

// At start-up, load the current patch, its lookups and stat shards in the
// background, so the first visitor after a deploy doesn't wait for them
// (SPD-09). Not awaited: requests that arrive first share the same loads.
// Skipped while `vite build` runs, which has no riot-proxy. The build's identity
// goes to the log first, so a journal shows which release a line came from. The
// status checks start here too (ADR-062).
export const init: ServerInit = () => {
	if (building) return;
	console.log(`ninjagoldfinch-lol ${BUILD.version} commit ${BUILD.commit} built ${BUILD.built_at}`);
	void warmPatch();
	startChecks(probeClient, STATUS_CHECK_INTERVAL_S);
};

// Errors and form posts must never be cached at the edge, whatever a load set,
// and a response no load gave a policy is not cached either. A slow request is
// logged with its riot-proxy calls (SPD-07). Every response carries the
// security headers; SvelteKit adds the CSP to pages itself (ADR-055). Every
// request is counted for /api/status (ADR-062).
export const handle: Handle = async ({ event, resolve }) => {
	let response: Response;
	try {
		response = await timeLoad(event.route?.id ?? null, event.isDataRequest, () => resolve(event));
	} catch (e) {
		countRequest(event.url.pathname, 500);
		throw e;
	}
	countRequest(event.url.pathname, response.status);
	const policy =
		responseCachePolicy(event.request.method, response.status) ??
		// A redirect thrown before a load set a policy comes back without one:
		// never cached. (SvelteKit marks its own data responses private, no-store.)
		(response.headers.has('cache-control') ? undefined : 'none');
	if (policy) response.headers.set('cache-control', CACHE_POLICIES[policy]);
	setSecurityHeaders(response.headers);
	return response;
};

// Errors thrown with error() (including proxy failures mapped by toHttpError)
// and SvelteKit's own, such as 404s, already carry safe messages. Anything
// else is a bug or an unreachable proxy: log the detail, show a generic message.
export const handleError: HandleServerError = ({ kind, error, event }) => {
	if (kind !== 'unknown') return;

	console.error(`error ${event.request.method} ${event.url.pathname}:`, error);
	return { message: 'Temporarily unavailable' };
};
