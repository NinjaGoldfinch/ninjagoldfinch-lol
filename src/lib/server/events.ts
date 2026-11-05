import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { hostname } from 'node:os';
import { join } from 'node:path';
import { rfc3339, type Check, type CheckStatus } from './status.ts';
import type { BuildInfo } from './version.ts';

// Events to an optional URL, to the shared event contract (ADR-063): state
// changes only, never a stream of check results. Sending never blocks or
// fails anything else: one background worker sends the queued events in order,
// retrying each, then dropping it.

export type Severity = 'info' | 'warning' | 'critical';

export type EventName = 'proxy_unreachable' | 'proxy_recovered' | 'deployed';

export interface SiteEvent {
	schema: 1;
	service: 'ninjagoldfinch-lol';
	host: string;
	event: EventName;
	severity: Severity;
	at: string;
	detail: Record<string, unknown>;
}

export const SEVERITY: Record<EventName, Severity> = {
	proxy_unreachable: 'critical',
	proxy_recovered: 'info',
	deployed: 'info'
};

export function siteEvent(
	event: EventName,
	detail: Record<string, unknown>,
	at: number = Date.now()
): SiteEvent {
	return {
		schema: 1,
		service: 'ninjagoldfinch-lol',
		host: hostname(),
		event,
		severity: SEVERITY[event],
		at: rfc3339(at),
		detail
	};
}

/** Attempts per event, the first included, before it is dropped. */
export const MAX_ATTEMPTS = 5;

/** How long one attempt may take, in ms. */
export const ATTEMPT_TIMEOUT_MS = 5_000;

type Fetch = (request: Request) => Promise<Response>;

/**
 * Sends one event: up to MAX_ATTEMPTS POSTs, 5 s each, waiting 1, 2, 4 and
 * 8 s between them. Any 2xx is delivered. A redirect is a failed attempt:
 * following a 301 or 302 would turn the POST into a GET with no body, whose
 * 2xx would count as delivered. Never throws: a dropped event is logged.
 * Callers don't await it.
 */
export async function deliver(
	url: string,
	event: SiteEvent,
	fetch: Fetch = globalThis.fetch,
	wait: (ms: number) => Promise<void> = (ms) => new Promise((r) => setTimeout(r, ms).unref()),
	timeoutMs: number = ATTEMPT_TIMEOUT_MS
): Promise<boolean> {
	let last = '';
	for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
		try {
			const response = await fetch(
				new Request(url, {
					method: 'POST',
					headers: { 'content-type': 'application/json' },
					body: JSON.stringify(event),
					signal: AbortSignal.timeout(timeoutMs),
					redirect: 'error'
				})
			);
			await response.body?.cancel();
			if (response.ok) return true;
			last = `answered ${response.status}`;
		} catch (e) {
			last = e instanceof Error ? e.message : String(e);
		}
		if (attempt < MAX_ATTEMPTS) await wait(1_000 * 2 ** (attempt - 1));
	}
	console.error(`event ${event.event} dropped after ${MAX_ATTEMPTS} attempts: ${last}`);
	return false;
}

/** Consecutive failed `riot_proxy` checks before `proxy_unreachable`. */
export const UNREACHABLE_AFTER = 3;

/**
 * Turns `riot_proxy` results into events: `proxy_unreachable` once, on the
 * third `down` in a row, and `proxy_recovered` once, on the first `ok` after
 * that. Anything else changes nothing. `raised` is whether an earlier run of
 * the server already sent `proxy_unreachable` for an outage it did not see end.
 */
export class ProxyAlarm {
	private failures = 0;

	constructor(private raised = false) {}

	observe(status: CheckStatus): 'proxy_unreachable' | 'proxy_recovered' | undefined {
		if (status === 'down') {
			this.failures += 1;
			if (this.failures >= UNREACHABLE_AFTER && !this.raised) {
				this.raised = true;
				return 'proxy_unreachable';
			}
			return undefined;
		}
		this.failures = 0;
		if (status === 'ok' && this.raised) {
			this.raised = false;
			return 'proxy_recovered';
		}
		return undefined;
	}
}

/**
 * Whether a start is a deploy: the version differs from the one recorded at
 * the previous start. The first start with nothing recorded, and a build that
 * is not a release (`dev`), are not.
 */
export function deployedChange(
	previous: string | undefined,
	current: string
): { from: string; to: string } | undefined {
	if (!previous || current === 'dev' || previous === current) return undefined;
	return { from: previous, to: current };
}

const STATE_FILE = 'last-version.json';
const ALARM_FILE = 'proxy-alarm.json';

/** The JSON in a state file; undefined if there is none, or it can't be read (logged). */
async function readState(file: string): Promise<unknown> {
	try {
		return JSON.parse(await readFile(file, 'utf8'));
	} catch (e) {
		if ((e as NodeJS.ErrnoException).code !== 'ENOENT') {
			console.error(`could not read ${file}:`, e);
		}
		return undefined;
	}
}

/** Writes a state file through a temporary file and a rename. Throws. */
async function writeState(dir: string, file: string, value: unknown): Promise<void> {
	await mkdir(dir, { recursive: true });
	const next = `${file}.tmp`;
	await writeFile(next, `${JSON.stringify(value)}\n`);
	await rename(next, file);
}

function field(recorded: unknown, name: string): unknown {
	return typeof recorded === 'object' && recorded !== null
		? (recorded as Record<string, unknown>)[name]
		: undefined;
}

/**
 * At start-up: reads the version the previous start recorded in `dir`, records
 * this one, and returns the change if there was one. Without a directory, or
 * if it can't be read or written, nothing is reported (and the failure logged).
 */
export async function recordStart(
	dir: string | undefined,
	build: BuildInfo
): Promise<{ from: string; to: string } | undefined> {
	if (!dir) return undefined;
	const file = join(dir, STATE_FILE);
	const version = field(await readState(file), 'version');
	const previous = typeof version === 'string' ? version : undefined;
	if (build.version === 'dev') return undefined;
	try {
		await writeState(dir, file, { version: build.version, commit: build.commit });
	} catch (e) {
		console.error(`could not record the version in ${file}:`, e);
		return undefined;
	}
	return deployedChange(previous, build.version);
}

/**
 * Whether an earlier run recorded in `dir` that it sent `proxy_unreachable`
 * and no `proxy_recovered` since. False without a directory or a record.
 */
export async function readRaised(dir: string | undefined): Promise<boolean> {
	if (!dir) return false;
	return field(await readState(join(dir, ALARM_FILE)), 'raised') === true;
}

/** Records in `dir` whether `proxy_unreachable` is raised. Never throws: a failure is logged. */
export async function writeRaised(dir: string | undefined, raised: boolean): Promise<void> {
	if (!dir) return;
	const file = join(dir, ALARM_FILE);
	try {
		await writeState(dir, file, { raised });
	} catch (e) {
		console.error(`could not record the alarm in ${file}:`, e);
	}
}

/** Events waiting to be sent, at most; a full queue drops the newest. */
export const QUEUE_LIMIT = 64;

/**
 * Where events go: a bounded queue and one worker that sends them in order, so
 * a `proxy_recovered` never overtakes the `proxy_unreachable` still being
 * retried. Without a URL, events are dropped silently. `push` never blocks.
 */
export class EventQueue {
	private readonly queue: SiteEvent[] = [];
	private worker: Promise<void> | undefined;

	constructor(
		readonly url: string | undefined,
		private readonly send: (url: string, event: SiteEvent) => Promise<unknown> = deliver
	) {}

	push(event: EventName, detail: Record<string, unknown> = {}): void {
		if (!this.url) return;
		if (this.queue.length >= QUEUE_LIMIT) {
			console.warn(`event ${event} dropped: ${QUEUE_LIMIT} events already waiting`);
			return;
		}
		this.queue.push(siteEvent(event, detail));
		this.worker ??= this.drain(this.url);
	}

	/** Settles once every queued event is sent or dropped. For the tests. */
	async idle(): Promise<void> {
		await this.worker;
	}

	private async drain(url: string): Promise<void> {
		for (let next = this.queue.shift(); next; next = this.queue.shift()) {
			try {
				await this.send(url, next);
			} catch (e) {
				console.error(`event ${next.event} dropped:`, e);
			}
		}
		this.worker = undefined;
	}
}

/**
 * What the status checks call with each `riot_proxy` result: pushes the event
 * a change of state makes, and records in `dir` whether `proxy_unreachable` is
 * raised. With the record, a server that restarts during an outage (a deploy,
 * a crash) still sends its `proxy_recovered`, and not a second
 * `proxy_unreachable`. Without a directory the alarm lives in this process only.
 * Without a URL nothing is watched, and the record is neither read nor written:
 * it says what the receiver was told, and with no URL it was told nothing.
 */
export function proxyWatch(
	dir: string | undefined,
	events: Pick<EventQueue, 'push' | 'url'>
): (check: Check) => Promise<void> {
	if (!events.url) return () => Promise.resolve();
	const alarm = readRaised(dir).then((raised) => new ProxyAlarm(raised));
	return async (check) => {
		const event = (await alarm).observe(check.status);
		if (!event) return;
		events.push(event, { reason: check.detail });
		await writeRaised(dir, event === 'proxy_unreachable');
	};
}
