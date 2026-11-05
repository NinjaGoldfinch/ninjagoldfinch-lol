import { hostname } from 'node:os';
import { isHttpError } from '@sveltejs/kit';
import { metrics, type Metrics } from './metrics.ts';
import { heldPatch } from './patch.ts';
import type { ProxyClient } from './proxy.ts';
import { BUILD, type BuildInfo } from './version.ts';

// GET /api/status, to the status contract every ninjagoldfinch service shares
// (ADR-062). Checks run in the background and their results are held, so the
// endpoint reads memory only and never waits on riot-proxy.

export type CheckStatus = 'ok' | 'degraded' | 'down';

export interface Check {
	name: string;
	status: CheckStatus;
	latency_ms: number;
	checked_at: string;
	detail: string;
}

export interface StatusDocument extends BuildInfo {
	schema: 1;
	service: 'ninjagoldfinch-lol';
	host: string;
	started_at: string;
	uptime_s: number;
	status: CheckStatus;
	checks: Check[];
	metrics: Record<string, number>;
}

/** The worst of the checks: any `down` is down, any `degraded` is degraded. */
export function overallStatus(checks: readonly Pick<Check, 'status'>[]): CheckStatus {
	if (checks.some((c) => c.status === 'down')) return 'down';
	if (checks.some((c) => c.status === 'degraded')) return 'degraded';
	return 'ok';
}

/** RFC 3339 in UTC, to the second. */
export function rfc3339(ms: number): string {
	return new Date(ms).toISOString().replace(/\.\d+Z$/, 'Z');
}

/** What one probe of riot-proxy's `/readyz` found. */
export type ProxyProbe =
	{ answered: true; status: number; body: unknown; ms: number } | { answered: false; ms: number };

/**
 * The `riot_proxy` check from a probe of `/readyz`: ok when it answers 200,
 * down when it can't be reached or answers anything else. A 503 names what is
 * not ready (its body has the same booleans as the 200). A 401 or 403 means
 * riot-proxy refused the site's key.
 */
export function riotProxyCheck(probe: ProxyProbe, at: number): Check {
	const check = (status: CheckStatus, detail: string): Check => ({
		name: 'riot_proxy',
		status,
		latency_ms: Math.round(probe.ms),
		checked_at: rfc3339(at),
		detail
	});
	if (!probe.answered) return check('down', 'unreachable');
	if (probe.status === 200) return check('ok', 'ready');
	if (probe.status === 401 || probe.status === 403) {
		return check('down', `key refused (${probe.status})`);
	}
	if (probe.status === 503) {
		const failing = notReady(probe.body);
		return check('down', failing.length > 0 ? `not ready: ${failing.join(', ')}` : 'not ready');
	}
	return check('down', `answered ${probe.status}`);
}

/** The readiness booleans that are false in a `/readyz` body. */
function notReady(body: unknown): string[] {
	if (typeof body !== 'object' || body === null) return [];
	return ['sqlite', 'limiter'].filter((k) => (body as Record<string, unknown>)[k] === false);
}

/**
 * The `static_data` check: pages need the current patch and its lookups. ok
 * once a patch is held; degraded before then, since each page then waits on
 * riot-proxy for it.
 */
export function staticDataCheck(
	patch: { current: string; at: number } | undefined,
	at: number
): Check {
	return {
		name: 'static_data',
		status: patch ? 'ok' : 'degraded',
		latency_ms: 0,
		checked_at: rfc3339(at),
		detail: patch ? `patch ${patch.current}` : 'no patch loaded yet'
	};
}

/** Asks riot-proxy whether it is ready. Never throws. */
export async function probeProxy(client: ProxyClient): Promise<ProxyProbe> {
	const started = performance.now();
	try {
		const { data, error, response } = await client.GET('/readyz');
		return { answered: true, status: response.status, body: data ?? error, ms: elapsed() };
	} catch (e) {
		// The client turns no answer (unreachable, or past its deadline) into a 503.
		if (!isHttpError(e)) console.error('riot_proxy check failed:', e);
		return { answered: false, ms: elapsed() };
	}

	function elapsed() {
		return performance.now() - started;
	}
}

const STARTED_AT = Date.now();

/** The last result of each check, by name. */
const results = new Map<string, Check>([
	[
		'riot_proxy',
		{
			name: 'riot_proxy',
			status: 'degraded',
			latency_ms: 0,
			checked_at: rfc3339(STARTED_AT),
			detail: 'not checked yet'
		}
	]
]);

/** Runs every check once and holds the results. */
export async function runChecks(client: ProxyClient, now: () => number = Date.now): Promise<void> {
	const probe = await probeProxy(client);
	results.set('riot_proxy', riotProxyCheck(probe, now()));
	results.set('static_data', staticDataCheck(heldPatch(), now()));
}

let timer: ReturnType<typeof setInterval> | undefined;

/**
 * Starts the checks: now, then every `intervalS` seconds. A check still
 * running when the next is due is not started twice. Called once at start-up.
 */
export function startChecks(client: ProxyClient, intervalS: number): void {
	if (timer) return;
	let running = false;
	const tick = async () => {
		if (running) return;
		running = true;
		try {
			await runChecks(client);
		} finally {
			running = false;
		}
	};
	void tick();
	timer = setInterval(() => void tick(), intervalS * 1000);
	timer.unref();
}

/** The status document from the held results. Reads memory only. */
export function statusDocument(
	now: number = Date.now(),
	checks: Check[] = [...results.values()],
	from: Metrics = metrics,
	build: BuildInfo = BUILD
): StatusDocument {
	const patch = heldPatch();
	return {
		schema: 1,
		service: 'ninjagoldfinch-lol',
		host: hostname(),
		version: build.version,
		commit: build.commit,
		built_at: build.built_at,
		started_at: rfc3339(STARTED_AT),
		uptime_s: Math.max(0, Math.floor((now - STARTED_AT) / 1000)),
		status: overallStatus(checks),
		checks,
		metrics: {
			...from.snapshot(now),
			patch_age_s: patch ? Math.max(0, Math.floor((now - patch.at) / 1000)) : 0
		}
	};
}
