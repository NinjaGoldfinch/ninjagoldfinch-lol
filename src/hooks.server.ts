import { building } from '$app/env';
import type { Handle, HandleServerError, ServerInit } from '@sveltejs/kit/hooks';
import { CACHE_POLICIES, responseCachePolicy } from '#lib/server/cache.ts';
import { warmPatch } from '#lib/server/patch.ts';
import { setSecurityHeaders } from '#lib/server/security.ts';
import { timeLoad } from '#lib/server/timing.ts';

// At start-up, load the current patch, its lookups and stat shards in the
// background, so the first visitor after a deploy doesn't wait for them
// (SPD-09). Not awaited: requests that arrive first share the same loads.
// Skipped while `vite build` runs, which has no riot-proxy.
export const init: ServerInit = () => {
	if (!building) void warmPatch();
};

// Errors and form posts must never be cached at the edge, whatever a load set,
// and a response no load gave a policy is not cached either. A slow request is
// logged with its riot-proxy calls (SPD-07). Every response carries the
// security headers; SvelteKit adds the CSP to pages itself (ADR-055).
export const handle: Handle = async ({ event, resolve }) => {
	const response = await timeLoad(event.route?.id ?? null, event.isDataRequest, () =>
		resolve(event)
	);
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
