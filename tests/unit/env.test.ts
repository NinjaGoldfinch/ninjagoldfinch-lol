import { afterEach, describe, expect, it, vi } from 'vitest';
import {
	DEFAULT_CDRAGON_URL,
	parseCdragonUrl,
	parseProxyKey,
	parseProxyUrl,
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
