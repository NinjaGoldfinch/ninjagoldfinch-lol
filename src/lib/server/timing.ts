import { AsyncLocalStorage } from 'node:async_hooks';
import type { Middleware } from 'openapi-fetch';

// Timing for each page load, in the server log only (SPD-07): no
// Server-Timing header, so nothing reaches the browser and the edge never
// replays a stale timing. A request slower than SLOW_LOAD_MS logs one line
// naming its route id and each riot-proxy call by its spec path, never the
// concrete path, so no player name is logged.

/** A request slower than this is logged. A warm champion page takes 8–15 ms, a cold one about 200 ms. */
export const SLOW_LOAD_MS = 100;

interface Call {
	/** openapi-fetch's id for the request. */
	id: string;
	method: string;
	/** The spec path, `/v1/players/{puuid}/matches`. */
	path: string;
	started: number;
	ms?: number;
	/** The status of an error response; `failed` when there was no response. */
	outcome?: number | 'failed';
}

/** The riot-proxy calls one request made, in the order they started. */
const calls = new AsyncLocalStorage<Call[]>();

/**
 * Records each riot-proxy call's time against the request that made it. A
 * call made outside a request (none today) is not recorded.
 */
export const timeCalls: Middleware = {
	onRequest({ id, request, schemaPath }) {
		calls
			.getStore()
			?.push({ id, method: request.method, path: schemaPath, started: performance.now() });
	},
	onResponse({ id, response }) {
		finish(id, response.ok ? undefined : response.status);
	},
	onError({ id }) {
		finish(id, 'failed');
	}
};

function finish(id: string, outcome: Call['outcome']): void {
	const call = calls.getStore()?.find((c) => c.id === id);
	if (!call) return;
	call.ms = Math.round(performance.now() - call.started);
	call.outcome = outcome;
}

/**
 * Runs a request with its riot-proxy calls recorded, and logs it if it took
 * longer than `threshold`. `route` is the SvelteKit route id
 * (`/summoner/[riotId]`), null when no route matched.
 */
export async function timeLoad<T>(
	route: string | null,
	isDataRequest: boolean,
	run: () => Promise<T>,
	threshold: number = SLOW_LOAD_MS
): Promise<T> {
	const started = performance.now();
	const made: Call[] = [];
	try {
		return await calls.run(made, run);
	} finally {
		const total = Math.round(performance.now() - started);
		if (total > threshold) console.warn(slowLoadLine(route, isDataRequest, total, made));
	}
}

function slowLoadLine(
	route: string | null,
	isDataRequest: boolean,
	total: number,
	made: Call[]
): string {
	const page = `${route ?? '(no route)'}${isDataRequest ? ' (data)' : ''}`;
	const parts = made.map(
		(c) =>
			`${c.method} ${c.path} ${c.ms === undefined ? 'unfinished' : `${c.ms}ms`}${c.outcome === undefined ? '' : ` ${c.outcome}`}`
	);
	return `slow load ${page} ${total}ms: ${parts.length > 0 ? parts.join(', ') : 'no riot-proxy calls'}`;
}
