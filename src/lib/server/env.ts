// Validation rules for the server's private environment. src/env.ts wires
// them into SvelteKit, which runs them at start-up and refuses to start if
// one throws. Read the validated values from $app/env/private, and only
// under src/lib/server/.
//
// This file must not import $app/env/*: src/env.ts imports it, and SvelteKit
// rejects that cycle.

/** Base URL of riot-proxy. Required in every environment. */
export function parseProxyUrl(value: string | undefined): string {
	if (!value) {
		throw new Error('PROXY_URL is required, e.g. http://riot-proxy:8080');
	}

	let url: URL;
	try {
		url = new URL(value);
	} catch {
		throw new Error(`PROXY_URL must be an absolute URL, got "${value}"`);
	}

	if (url.protocol !== 'http:' && url.protocol !== 'https:') {
		throw new Error(`PROXY_URL must use http or https, got "${url.protocol}"`);
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
