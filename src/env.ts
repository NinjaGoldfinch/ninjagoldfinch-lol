import { building } from '$app/env';
import { defineEnvVars } from '@sveltejs/kit/env';
import {
	parseCdragonUrl,
	parseEventsUrl,
	parseProxyKey,
	parseProxyUrl,
	parseStateDirectory,
	parseStatusCidrs,
	parseStatusInterval,
	parseStatusToken
} from '#lib/server/env.ts';

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
	CDRAGON_URL: {
		description: 'Base URL of CommunityDragon, for stat shard names. Optional.',
		schema: atStartup(parseCdragonUrl)
	},
	PROXY_KEY: {
		description: 'riot-proxy consumer key. Secret. Required when NODE_ENV=production.',
		schema: atStartup((value) => parseProxyKey(value, process.env.NODE_ENV === 'production'))
	},
	STATUS_TOKEN: {
		description:
			'Bearer token for GET /api/status. Secret. Optional; without it only local requests may read it.',
		schema: atStartup(parseStatusToken)
	},
	STATUS_ALLOW_CIDR: {
		description: 'Comma-separated CIDRs that may read GET /api/status without the token. Optional.',
		schema: atStartup(parseStatusCidrs)
	},
	STATUS_CHECK_INTERVAL_S: {
		description: 'Seconds between the background status checks. Optional; 30 by default.',
		schema: atStartup(parseStatusInterval)
	},
	EVENTS_URL: {
		description: 'URL that state-change events are POSTed to. Optional; no events without it.',
		schema: atStartup(parseEventsUrl)
	},
	STATE_DIRECTORY: {
		description:
			"Writable directory for the last start's version (the deployed event) and the raised proxy alarm. systemd's StateDirectory= sets it. Optional.",
		schema: atStartup(parseStateDirectory)
	}
});
