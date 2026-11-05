import { describe, expect, it, vi } from 'vitest';
import { statusAccessAllowed } from '#lib/server/status-access.ts';

const TOKEN = 'status-token-placeholder-0123456789';

vi.mock('$app/env/private', async (actual) => ({
	...(await actual<Record<string, unknown>>()),
	STATUS_TOKEN: 'status-token-placeholder-0123456789',
	STATUS_ALLOW_CIDR: ['10.20.0.0/16']
}));

const { GET } = await import('../../src/routes/api/status/+server.ts');

describe('statusAccessAllowed', () => {
	const config = { token: TOKEN, cidrs: ['10.20.0.0/16', 'fd00::/8'] };
	const allowed = (request: Partial<Parameters<typeof statusAccessAllowed>[0]>) =>
		statusAccessAllowed(
			{ authorization: null, viaCloudflare: false, address: '203.0.113.9', ...request },
			config
		);

	it('lets the token in from anywhere, Cloudflare too', () => {
		expect(allowed({ authorization: `Bearer ${TOKEN}`, viaCloudflare: true })).toBe(true);
		expect(allowed({ authorization: `bearer ${TOKEN}` })).toBe(true);
	});

	it('refuses a wrong or malformed token', () => {
		expect(allowed({ authorization: `Bearer ${TOKEN}x` })).toBe(false);
		expect(allowed({ authorization: TOKEN })).toBe(false);
		expect(allowed({ authorization: 'Bearer ' })).toBe(false);
	});

	it('lets a local request in without the token', () => {
		expect(allowed({ address: '127.0.0.1' })).toBe(true);
		expect(allowed({ address: '::1' })).toBe(true);
		expect(allowed({ address: '::ffff:127.0.0.1' })).toBe(true);
	});

	it('lets the configured networks in without the token', () => {
		expect(allowed({ address: '10.20.3.4' })).toBe(true);
		expect(allowed({ address: '::ffff:10.20.3.4' })).toBe(true);
		expect(allowed({ address: 'fd12::1' })).toBe(true);
		expect(allowed({ address: '10.21.0.1' })).toBe(false);
	});

	// cloudflared reaches the site on loopback, so every public request looks local.
	it('refuses a request through Cloudflare without the token, even from loopback', () => {
		expect(allowed({ address: '127.0.0.1', viaCloudflare: true })).toBe(false);
		expect(allowed({ address: '10.20.3.4', viaCloudflare: true })).toBe(false);
	});

	it('refuses an unknown address', () => {
		expect(allowed({ address: undefined })).toBe(false);
		expect(allowed({ address: 'not-an-ip' })).toBe(false);
	});

	it('has no token path when no token is set', () => {
		expect(
			statusAccessAllowed(
				{ authorization: 'Bearer ', viaCloudflare: false, address: '203.0.113.9' },
				{ token: undefined, cidrs: [] }
			)
		).toBe(false);
	});
});

describe('GET /api/status', () => {
	const get = (headers: Record<string, string>, address = '127.0.0.1') =>
		GET({
			request: new Request('http://localhost/api/status', { headers }),
			getClientAddress: () => address
		} as unknown as Parameters<typeof GET>[0]);

	it('answers the status to the token, uncached', async () => {
		const response = await get(
			{ authorization: `Bearer ${TOKEN}`, 'cf-connecting-ip': '198.51.100.7' },
			'127.0.0.1'
		);
		expect(response.status).toBe(200);
		expect(response.headers.get('cache-control')).toBe('no-store');
		expect(await response.json()).toMatchObject({ schema: 1, service: 'ninjagoldfinch-lol' });
	});

	it('answers a request from the host itself', async () => {
		expect((await get({})).status).toBe(200);
	});

	it('answers a configured network', async () => {
		expect((await get({}, '10.20.0.5')).status).toBe(200);
	});

	it('is 401 to the public without the token', async () => {
		const response = await get({ 'cf-connecting-ip': '198.51.100.7' });
		expect(response.status).toBe(401);
		expect(response.headers.get('www-authenticate')).toBe('Bearer');
		expect(response.headers.get('cache-control')).toBe('no-store');
		expect(await response.json()).toEqual({ error: 'unauthorized' });
		expect((await get({}, '203.0.113.9')).status).toBe(401);
	});
});
