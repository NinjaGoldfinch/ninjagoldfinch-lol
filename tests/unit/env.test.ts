import { afterEach, describe, expect, it, vi } from 'vitest';
import {
	DEFAULT_CDRAGON_URL,
	parseCdragonUrl,
	parseEventsUrl,
	parseProxyKey,
	parseProxyUrl,
	parseStateDirectory,
	parseStatusCidrs,
	parseStatusInterval,
	parseStatusToken
} from '#lib/server/env.ts';
import { variables } from '../../src/env';

const KEY = 'placeholder-key';

describe('parseProxyKey', () => {
	it('is optional outside production', () => {
		expect(parseProxyKey(undefined, false)).toBeUndefined();
		expect(parseProxyKey('', false)).toBeUndefined();
		expect(parseProxyKey(KEY, false)).toBe(KEY);
	});

	it('is required in production', () => {
		expect(() => parseProxyKey(undefined, true)).toThrow('PROXY_KEY is required');
		expect(() => parseProxyKey('  ', true)).toThrow('PROXY_KEY is required');
		expect(parseProxyKey(KEY, true)).toBe(KEY);
	});
});

describe('parseProxyUrl', () => {
	it('accepts http and https URLs', () => {
		expect(parseProxyUrl('http://192.168.68.46:8080')).toBe('http://192.168.68.46:8080');
		expect(parseProxyUrl('https://proxy.example.com')).toBe('https://proxy.example.com');
	});

	it('rejects missing, relative and non-http values', () => {
		expect(() => parseProxyUrl(undefined)).toThrow('PROXY_URL is required');
		expect(() => parseProxyUrl('')).toThrow('PROXY_URL is required');
		expect(() => parseProxyUrl('riot-proxy:8080/v1')).toThrow('http or https');
		expect(() => parseProxyUrl('/v1')).toThrow('absolute URL');
	});
});

describe('parseCdragonUrl', () => {
	it('defaults to CommunityDragon', () => {
		expect(parseCdragonUrl(undefined)).toBe(DEFAULT_CDRAGON_URL);
		expect(parseCdragonUrl('')).toBe('https://raw.communitydragon.org');
	});

	it('takes a mirror, without a trailing slash', () => {
		expect(parseCdragonUrl('http://cdragon.lan:8080/')).toBe('http://cdragon.lan:8080');
		expect(() => parseCdragonUrl('cdragon.lan')).toThrow('CDRAGON_URL must be an absolute URL');
		expect(() => parseCdragonUrl('ftp://cdragon.lan')).toThrow('http or https');
	});
});

// The declarations SvelteKit validates at start-up.
describe('src/env.ts PROXY_KEY', () => {
	const validate = (value: string | undefined) =>
		variables.PROXY_KEY.schema['~standard'].validate(value);

	afterEach(() => {
		vi.unstubAllEnvs();
	});

	it('lets the server start without a key in development', () => {
		vi.stubEnv('NODE_ENV', 'development');
		expect(validate(undefined)).toEqual({ value: undefined });
	});

	it('stops the server starting without a key when NODE_ENV=production', () => {
		vi.stubEnv('NODE_ENV', 'production');
		expect(validate(undefined)).toMatchObject({
			issues: [{ message: 'PROXY_KEY is required when NODE_ENV=production' }]
		});
		expect(validate(KEY)).toEqual({ value: KEY });
	});
});

describe('parseStatusToken', () => {
	it('is optional, and trimmed', () => {
		expect(parseStatusToken(undefined)).toBeUndefined();
		expect(parseStatusToken('  ')).toBeUndefined();
		expect(parseStatusToken(' status-token-placeholder ')).toBe('status-token-placeholder');
	});

	it('refuses a token too short to guard anything', () => {
		expect(() => parseStatusToken('short')).toThrow('at least 16');
	});
});

describe('parseStatusCidrs', () => {
	it('reads a comma-separated list, empty by default', () => {
		expect(parseStatusCidrs(undefined)).toEqual([]);
		expect(parseStatusCidrs('')).toEqual([]);
		expect(parseStatusCidrs(' 10.0.0.0/8, fd00::/8 ,')).toEqual(['10.0.0.0/8', 'fd00::/8']);
	});

	it('refuses anything but CIDRs', () => {
		expect(() => parseStatusCidrs('10.0.0.1')).toThrow('STATUS_ALLOW_CIDR');
		expect(() => parseStatusCidrs('10.0.0.0/33')).toThrow('STATUS_ALLOW_CIDR');
		expect(() => parseStatusCidrs('example.com/8')).toThrow('STATUS_ALLOW_CIDR');
	});
});

describe('parseStatusInterval', () => {
	it('is 30 s by default', () => {
		expect(parseStatusInterval(undefined)).toBe(30);
		expect(parseStatusInterval('')).toBe(30);
		expect(parseStatusInterval('60')).toBe(60);
	});

	it('refuses anything but whole seconds from 5 to 3600', () => {
		for (const bad of ['4', '3601', '1.5', 'thirty']) {
			expect(() => parseStatusInterval(bad)).toThrow('STATUS_CHECK_INTERVAL_S');
		}
	});
});

describe('parseEventsUrl', () => {
	it('is optional', () => {
		expect(parseEventsUrl(undefined)).toBeUndefined();
		expect(parseEventsUrl('  ')).toBeUndefined();
		expect(parseEventsUrl(' https://bot.example/events ')).toBe('https://bot.example/events');
	});

	it('refuses anything but an absolute http or https URL', () => {
		expect(() => parseEventsUrl('bot.example/events')).toThrow('EVENTS_URL');
		expect(() => parseEventsUrl('ftp://bot.example/events')).toThrow('EVENTS_URL');
	});

	/** The message `parseEventsUrl` refuses a value with. */
	const refusal = (value: string): string => {
		try {
			parseEventsUrl(value);
		} catch (e) {
			return e instanceof Error ? e.message : String(e);
		}
		throw new Error(`accepted ${value}`);
	};

	// fetch refuses such a URL, and its error holds the whole URL (ADR-063).
	it.each([
		'https://bot:made-up-password@bot.example/events',
		'https://bot@bot.example/events',
		'https://:made-up-password@bot.example/events',
		' http://bot:made-up-password@127.0.0.1:8090/events '
	])('refuses a username or password, without showing the value: %s', (value) => {
		const message = refusal(value);
		expect(message).toMatch(/^EVENTS_URL must not have a username or password/);
		expect(message).not.toContain('made-up-password');
		expect(message).not.toContain('bot');
	});

	it('accepts a token in the path or the query string', () => {
		for (const url of [
			'https://bot.example/events?token=made-up-token',
			'https://bot.example/hooks/made-up-token/events'
		]) {
			expect(parseEventsUrl(url)).toBe(url);
		}
	});

	it('does not show a value it refuses, which may hold a token', () => {
		for (const value of [
			'bot.example/events?token=made-up-token',
			'ftp://bot.example/events?token=made-up-token',
			'htps://bot:made-up-token@bot.example/events',
			'made-up-token:bot.example/events'
		]) {
			const message = refusal(value);
			expect(message).toMatch(/^EVENTS_URL must .* \(value not shown\)$/);
			expect(message).not.toContain('made-up-token');
			expect(message).not.toContain('bot.example');
		}
		// The other URLs hold no secret and still show a mistyped value.
		expect(() => parseProxyUrl('//riot-proxy:8080')).toThrow('got "//riot-proxy:8080"');
	});
});

describe('parseStateDirectory', () => {
	it("is optional, and the first of systemd's directories", () => {
		expect(parseStateDirectory(undefined)).toBeUndefined();
		expect(parseStateDirectory('')).toBeUndefined();
		expect(parseStateDirectory('/var/lib/ninjagoldfinch-lol')).toBe('/var/lib/ninjagoldfinch-lol');
		expect(parseStateDirectory('/var/lib/a:/var/lib/b')).toBe('/var/lib/a');
	});

	it('refuses a relative path', () => {
		expect(() => parseStateDirectory('state')).toThrow('STATE_DIRECTORY');
	});
});
