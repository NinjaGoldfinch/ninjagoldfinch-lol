// Cache-Control for every page load, so Cloudflare serves repeat views.
// riot-proxy already caches Riot; this only sets how long the edge may
// reuse a rendered page. Starting values are from the plan.

export const CACHE_POLICIES = {
	/** Profile pages: 60 s at the edge, then stale for up to 5 min while refreshing. */
	profile: 'public, s-maxage=60, stale-while-revalidate=300',
	/** Match pages: a finished match never changes, so a day at the edge, then stale for another. */
	match: 'public, s-maxage=86400, stale-while-revalidate=86400',
	/** Champion analytics: riot-proxy recomputes them per crawl, so 10 min at the edge. */
	analytics: 'public, s-maxage=600, stale-while-revalidate=600',
	/** Pages without proxy data (home, about): 10 min at the edge, then stale for another 10. */
	static: 'public, s-maxage=600, stale-while-revalidate=600',
	/** Not-found pages: briefly, so repeated misses do not all reach riot-proxy. */
	notFound: 'public, s-maxage=60',
	/** Never cached: redirects, health checks, errors, anything per-request. */
	none: 'no-store'
} as const;

export type CachePolicy = keyof typeof CACHE_POLICIES;

export function cacheControl(policy: CachePolicy): { 'cache-control': string } {
	return { 'cache-control': CACHE_POLICIES[policy] };
}

/**
 * The policy a finished response must have regardless of what its load set:
 * form posts and errors are never cached, except a short-lived not-found.
 * undefined leaves the response's own header alone.
 */
export function responseCachePolicy(method: string, status: number): CachePolicy | undefined {
	if (method !== 'GET' && method !== 'HEAD') return 'none';
	if (status === 404) return 'notFound';
	if (status >= 400) return 'none';
	return undefined;
}
