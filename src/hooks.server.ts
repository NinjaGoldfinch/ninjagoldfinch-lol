import type { Handle, HandleServerError } from '@sveltejs/kit/hooks';
import { CACHE_POLICIES, responseCachePolicy } from '#lib/server/cache.ts';

// Errors and form posts must never be cached at the edge, whatever a load set,
// and a response no load gave a policy is not cached either.
export const handle: Handle = async ({ event, resolve }) => {
	const response = await resolve(event);
	const policy =
		responseCachePolicy(event.request.method, response.status) ??
		// A redirect thrown before a load set a policy comes back without one:
		// never cached. (SvelteKit marks its own data responses private, no-store.)
		(response.headers.has('cache-control') ? undefined : 'none');
	if (policy) response.headers.set('cache-control', CACHE_POLICIES[policy]);
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
