import { building } from '$app/env';
import { defineEnvVars } from '@sveltejs/kit/env';
import { parseProxyKey, parseProxyUrl } from '#lib/server/env.ts';

// SvelteKit also runs these validators while `vite build` analyses routes,
// where the runtime environment is absent and NODE_ENV is always production.
// Validate only when the server actually starts.
function atStartup<T>(validate: (value: string | undefined) => T) {
	return (value: string | undefined) => (building ? (value as T) : validate(value));
}

export const variables = defineEnvVars({
	PROXY_URL: {
		description: 'Base URL of riot-proxy.',
		schema: atStartup(parseProxyUrl)
	},
	PUBLIC_SITE_NAME: {
		description: 'Site name shown in the header and legal notice. Public.',
		public: true,
		static: true,
		schema: (value) => value || 'ninjagoldfinch.lol'
	},
	PROXY_KEY: {
		description: 'riot-proxy consumer key. Secret. Required when NODE_ENV=production.',
		schema: atStartup((value) => parseProxyKey(value, process.env.NODE_ENV === 'production'))
	}
});
