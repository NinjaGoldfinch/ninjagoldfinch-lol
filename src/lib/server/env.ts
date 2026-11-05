// Validation rules for the server's private environment. src/env.ts wires
// them into SvelteKit, which runs them at start-up and refuses to start if
// one throws. Read the validated values from $app/env/private, and only
// under src/lib/server/.
//
// This file must not import $app/env/*: src/env.ts imports it, and SvelteKit
// rejects that cycle.

import { isIP } from 'node:net';

/** Base URL of riot-proxy. Required in every environment. */
export function parseProxyUrl(value: string | undefined): string {
	if (!value) {
		throw new Error('PROXY_URL is required, e.g. http://riot-proxy:8080');
	}
	return httpUrl('PROXY_URL', value);
}

export const DEFAULT_CDRAGON_URL = 'https://raw.communitydragon.org';

/**
 * Base URL of CommunityDragon, for the data riot-proxy does not mirror (stat
 * shard names). Optional; a mirror can stand in for it. No trailing slash.
 */
export function parseCdragonUrl(value: string | undefined): string {
	return value ? httpUrl('CDRAGON_URL', value).replace(/\/+$/, '') : DEFAULT_CDRAGON_URL;
}

function httpUrl(name: string, value: string): string {
	let url: URL;
	try {
		url = new URL(value);
	} catch {
		throw new Error(`${name} must be an absolute URL, got "${value}"`);
	}

	if (url.protocol !== 'http:' && url.protocol !== 'https:') {
		throw new Error(`${name} must use http or https, got "${url.protocol}"`);
	}

	return value;
}

/**
 * riot-proxy consumer key. Optional in development, where the dev proxy can
 * run with auth disabled; required in production, because riot-proxy refuses
 * to run in production without auth. An empty value counts as unset.
 */
export function parseProxyKey(value: string | undefined, production: boolean): string | undefined {
	const key = value?.trim() || undefined;

	if (!key && production) {
		throw new Error('PROXY_KEY is required when NODE_ENV=production');
	}

	return key;
}

/**
 * Bearer token for `GET /api/status`. Optional: without it, only a local
 * request may read the status (ADR-062). A short token is refused, so a
 * placeholder never guards it.
 */
export function parseStatusToken(value: string | undefined): string | undefined {
	const token = value?.trim() || undefined;
	if (token && token.length < 16) {
		throw new Error('STATUS_TOKEN must be at least 16 characters; generate one with openssl rand');
	}
	return token;
}

/**
 * Networks, besides loopback, that may read `GET /api/status` without the
 * token: comma-separated CIDRs such as `10.0.0.0/8,fd00::/8`. Empty by default.
 */
export function parseStatusCidrs(value: string | undefined): string[] {
	const cidrs = (value ?? '')
		.split(',')
		.map((c) => c.trim())
		.filter((c) => c !== '');
	for (const cidr of cidrs) {
		if (!parseCidr(cidr)) {
			throw new Error(`STATUS_ALLOW_CIDR must be CIDRs such as 10.0.0.0/8, got "${cidr}"`);
		}
	}
	return cidrs;
}

/** A CIDR's network, prefix and family; undefined if it isn't one. */
export function parseCidr(
	cidr: string
): { network: string; prefix: number; family: 'ipv4' | 'ipv6' } | undefined {
	const match = /^([^/]+)\/(\d{1,3})$/.exec(cidr);
	if (!match) return undefined;
	const [, network = '', bits = ''] = match;
	const version = isIP(network);
	const prefix = Number(bits);
	if (version === 4 && prefix <= 32) return { network, prefix, family: 'ipv4' };
	if (version === 6 && prefix <= 128) return { network, prefix, family: 'ipv6' };
	return undefined;
}

export const DEFAULT_STATUS_INTERVAL_S = 30;

/** Seconds between the status checks; 30 by default, 5 to 3600. */
export function parseStatusInterval(value: string | undefined): number {
	if (!value?.trim()) return DEFAULT_STATUS_INTERVAL_S;
	const seconds = Number(value);
	if (!Number.isInteger(seconds) || seconds < 5 || seconds > 3600) {
		throw new Error(`STATUS_CHECK_INTERVAL_S must be whole seconds from 5 to 3600, got "${value}"`);
	}
	return seconds;
}

/**
 * Where events are POSTed (ADR-063). Optional: without it, no events are
 * sent.
 */
export function parseEventsUrl(value: string | undefined): string | undefined {
	return value?.trim() ? httpUrl('EVENTS_URL', value.trim()) : undefined;
}

/**
 * A writable directory for the version the last start recorded, for the
 * `deployed` event, and for whether `proxy_unreachable` is raised (ADR-063).
 * systemd sets STATE_DIRECTORY from the unit's `StateDirectory=`. Optional:
 * without it, no `deployed` event is sent, and the alarm is not kept across
 * restarts.
 */
export function parseStateDirectory(value: string | undefined): string | undefined {
	const dir = value?.trim() || undefined;
	// systemd lists several directories with colons when the unit names several.
	const first = dir?.split(':')[0];
	if (first !== undefined && !first.startsWith('/')) {
		throw new Error(`STATE_DIRECTORY must be an absolute path, got "${value}"`);
	}
	return first;
}
