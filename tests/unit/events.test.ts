import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { hostname, tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
	EventQueue,
	MAX_ATTEMPTS,
	ProxyAlarm,
	QUEUE_LIMIT,
	UNREACHABLE_AFTER,
	deliver,
	deployedChange,
	recordStart,
	siteEvent,
	type SiteEvent
} from '#lib/server/events.ts';
import type { BuildInfo } from '#lib/server/version.ts';

const URL = 'http://events.test/in';
const AT = Date.parse('2026-11-05T10:00:00Z');
const build = (version: string): BuildInfo => ({
	version,
	commit: version === 'dev' ? 'dev' : 'abc1234',
	built_at: '2026-11-05T09:00:00Z'
});
const noWait = () => Promise.resolve();

afterEach(() => vi.restoreAllMocks());

describe('siteEvent', () => {
	it("is the shared contract's event, with this machine's hostname", () => {
		expect(siteEvent('proxy_unreachable', { reason: 'unreachable' }, AT)).toEqual({
			schema: 1,
			service: 'ninjagoldfinch-lol',
			host: hostname(),
			event: 'proxy_unreachable',
			severity: 'critical',
			at: '2026-11-05T10:00:00Z',
			detail: { reason: 'unreachable' }
		});
		expect(siteEvent('proxy_recovered', {}, AT).severity).toBe('info');
		expect(siteEvent('deployed', { from: '1.1.0', to: '1.2.0' }, AT).severity).toBe('info');
	});
});

describe('deliver', () => {
	const event = siteEvent('deployed', { from: '1.1.0', to: '1.2.0' }, AT);

	it('POSTs the event as JSON once when answered 2xx', async () => {
		const seen: Request[] = [];
		const ok = await deliver(URL, event, async (r) => {
			seen.push(r);
			return new Response(null, { status: 204 });
		});
		expect(ok).toBe(true);
		expect(seen).toHaveLength(1);
		expect(seen[0]?.method).toBe('POST');
		expect(seen[0]?.url).toBe(URL);
		expect(seen[0]?.headers.get('content-type')).toBe('application/json');
		expect(await seen[0]?.json()).toEqual(event);
	});

	it('retries after 1, 2, 4 and 8 s, then drops the event and logs it', async () => {
		const error = vi.spyOn(console, 'error').mockImplementation(() => {});
		const waits: number[] = [];
		let calls = 0;
		const ok = await deliver(
			URL,
			event,
			async () => {
				calls += 1;
				return new Response('no', { status: 503 });
			},
			async (ms) => {
				waits.push(ms);
			}
		);
		expect(ok).toBe(false);
		expect(calls).toBe(MAX_ATTEMPTS);
		expect(waits).toEqual([1_000, 2_000, 4_000, 8_000]);
		expect(error).toHaveBeenCalledWith('event deployed dropped after 5 attempts: answered 503');
	});

	it('counts a network failure as a failed attempt, and stops at the first success', async () => {
		let calls = 0;
		const ok = await deliver(
			URL,
			event,
			async () => {
				calls += 1;
				if (calls < 3) throw new TypeError('fetch failed');
				return new Response(null, { status: 200 });
			},
			noWait
		);
		expect(ok).toBe(true);
		expect(calls).toBe(3);
	});
});

describe('ProxyAlarm', () => {
	it('raises proxy_unreachable once, on the third down in a row', () => {
		const alarm = new ProxyAlarm();
		const seen = ['down', 'down', 'down', 'down', 'down'].map((s) => alarm.observe(s as 'down'));
		expect(seen).toEqual([undefined, undefined, 'proxy_unreachable', undefined, undefined]);
		expect(UNREACHABLE_AFTER).toBe(3);
	});

	it('does not raise on downs broken by an ok or a degraded', () => {
		const alarm = new ProxyAlarm();
		for (const s of ['down', 'down', 'ok', 'down', 'down', 'degraded', 'down'] as const) {
			expect(alarm.observe(s)).toBeUndefined();
		}
	});

	it('reports proxy_recovered once, on the first ok after it was raised', () => {
		const alarm = new ProxyAlarm();
		for (const s of ['down', 'down', 'down'] as const) alarm.observe(s);
		expect(alarm.observe('degraded')).toBeUndefined();
		expect(alarm.observe('ok')).toBe('proxy_recovered');
		expect(alarm.observe('ok')).toBeUndefined();
	});

	it('fires again for a second outage', () => {
		const alarm = new ProxyAlarm();
		const run = (statuses: ('ok' | 'down')[]) => statuses.map((s) => alarm.observe(s));
		expect(run(['down', 'down', 'down', 'ok'])).toEqual([
			undefined,
			undefined,
			'proxy_unreachable',
			'proxy_recovered'
		]);
		expect(run(['down', 'down', 'down'])).toEqual([undefined, undefined, 'proxy_unreachable']);
	});
});

describe('deployedChange', () => {
	it('is a change of release version only', () => {
		expect(deployedChange('1.1.0', '1.2.0')).toEqual({ from: '1.1.0', to: '1.2.0' });
		expect(deployedChange('1.2.0', '1.1.0')).toEqual({ from: '1.2.0', to: '1.1.0' });
		expect(deployedChange('1.1.0', '1.1.0')).toBeUndefined();
		expect(deployedChange(undefined, '1.1.0')).toBeUndefined();
		expect(deployedChange('1.1.0', 'dev')).toBeUndefined();
	});
});

describe('recordStart', () => {
	let dir = '';
	afterEach(() => rmSync(dir, { recursive: true, force: true }));
	const state = () => JSON.parse(readFileSync(join(dir, 'last-version.json'), 'utf8'));

	it('records the first start without reporting it, then reports a new version', async () => {
		dir = mkdtempSync(join(tmpdir(), 'ngf-state-'));
		expect(await recordStart(dir, build('1.1.0'))).toBeUndefined();
		expect(state()).toEqual({ version: '1.1.0', commit: 'abc1234' });
		expect(await recordStart(dir, build('1.1.0'))).toBeUndefined();
		expect(await recordStart(dir, build('1.2.0'))).toEqual({ from: '1.1.0', to: '1.2.0' });
		expect(state()).toEqual({ version: '1.2.0', commit: 'abc1234' });
	});

	it('makes the directory if it is missing', async () => {
		dir = mkdtempSync(join(tmpdir(), 'ngf-state-'));
		const nested = join(dir, 'a', 'b');
		expect(await recordStart(nested, build('1.1.0'))).toBeUndefined();
		expect(JSON.parse(readFileSync(join(nested, 'last-version.json'), 'utf8')).version).toBe(
			'1.1.0'
		);
	});

	it('neither records nor reports a dev build', async () => {
		dir = mkdtempSync(join(tmpdir(), 'ngf-state-'));
		await recordStart(dir, build('1.1.0'));
		expect(await recordStart(dir, build('dev'))).toBeUndefined();
		expect(state().version).toBe('1.1.0');
	});

	it('treats an unreadable record as none, and logs it', async () => {
		const error = vi.spyOn(console, 'error').mockImplementation(() => {});
		dir = mkdtempSync(join(tmpdir(), 'ngf-state-'));
		writeFileSync(join(dir, 'last-version.json'), 'not json');
		expect(await recordStart(dir, build('1.2.0'))).toBeUndefined();
		expect(error).toHaveBeenCalled();
		expect(state().version).toBe('1.2.0');
	});

	it('reports nothing when the directory cannot be written, and logs it', async () => {
		const error = vi.spyOn(console, 'error').mockImplementation(() => {});
		dir = mkdtempSync(join(tmpdir(), 'ngf-state-'));
		const file = join(dir, 'a-file');
		writeFileSync(file, '');
		expect(await recordStart(join(file, 'state'), build('1.2.0'))).toBeUndefined();
		expect(error).toHaveBeenCalled();
	});

	it('does nothing without a directory', async () => {
		expect(await recordStart(undefined, build('1.2.0'))).toBeUndefined();
	});
});

describe('EventQueue', () => {
	it('sends nothing without a URL', async () => {
		const send = vi.fn(async () => true);
		const queue = new EventQueue(undefined, send);
		queue.push('deployed', { from: '1.1.0', to: '1.2.0' });
		await queue.idle();
		expect(send).not.toHaveBeenCalled();
	});

	it('sends one event at a time, in order, each after the last is done', async () => {
		const log: string[] = [];
		let release: () => void = () => {};
		const queue = new EventQueue(URL, async (url, event: SiteEvent) => {
			log.push(`start ${event.event}`);
			if (event.event === 'proxy_unreachable') {
				// Still being retried when the recovery is pushed.
				await new Promise<void>((r) => (release = r));
			}
			log.push(`end ${event.event} to ${url}`);
		});
		queue.push('proxy_unreachable', { reason: 'unreachable' });
		queue.push('proxy_recovered', { reason: '' });
		await Promise.resolve();
		expect(log).toEqual(['start proxy_unreachable']);
		release();
		await queue.idle();
		expect(log).toEqual([
			'start proxy_unreachable',
			`end proxy_unreachable to ${URL}`,
			'start proxy_recovered',
			`end proxy_recovered to ${URL}`
		]);
	});

	it(`drops an event, with a warning, when ${QUEUE_LIMIT} are already waiting`, async () => {
		const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
		const sent: SiteEvent[] = [];
		let release: () => void = () => {};
		const blocked = new Promise<void>((r) => (release = r));
		const queue = new EventQueue(URL, async (_url, event) => {
			await blocked;
			sent.push(event);
		});
		// The first is taken by the worker at once; the next QUEUE_LIMIT wait.
		for (let i = 0; i < QUEUE_LIMIT + 2; i++) queue.push('deployed', { n: i });
		expect(warn).toHaveBeenCalledTimes(1);
		expect(warn).toHaveBeenCalledWith(
			`event deployed dropped: ${QUEUE_LIMIT} events already waiting`
		);
		release();
		await queue.idle();
		expect(sent.map((e) => e.detail.n)).toEqual([...Array(QUEUE_LIMIT + 1).keys()]);
	});

	it('starts again for events pushed after it went idle', async () => {
		const sent: string[] = [];
		const queue = new EventQueue(URL, async (_url, event) => {
			sent.push(event.event);
		});
		queue.push('proxy_unreachable');
		await queue.idle();
		queue.push('proxy_recovered');
		await queue.idle();
		expect(sent).toEqual(['proxy_unreachable', 'proxy_recovered']);
	});
});
