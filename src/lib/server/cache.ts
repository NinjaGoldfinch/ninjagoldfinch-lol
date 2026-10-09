// Cache-Control for every page load, so Cloudflare serves repeat views.
// riot-proxy already caches Riot; this only sets how long the edge may
// reuse a rendered page. Starting values are from the plan.

export const CACHE_POLICIES = {
	/** Profile pages: 60 s at the edge, then stale for up to 5 min while refreshing. */
	profile: 'public, s-maxage=60, stale-while-revalidate=300',
	/** Never cached: redirects, health checks, anything per-request. */
	none: 'no-store'
} as const;

export type CachePolicy = keyof typeof CACHE_POLICIES;

export function cacheControl(policy: CachePolicy): { 'cache-control': string } {
	return { 'cache-control': CACHE_POLICIES[policy] };
}
