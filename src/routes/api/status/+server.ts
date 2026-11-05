import { json } from '@sveltejs/kit';
import { STATUS_ALLOW_CIDR, STATUS_TOKEN } from '$app/env/private';
import { cacheControl } from '#lib/server/cache.ts';
import { statusAccessAllowed } from '#lib/server/status-access.ts';
import { statusDocument } from '#lib/server/status.ts';
import type { RequestHandler } from './$types';

// The shared status contract (ADR-062). Held results only: this never calls
// riot-proxy. A bearer token, or a local request; never cached.
export const GET: RequestHandler = ({ request, getClientAddress }) => {
	const allowed = statusAccessAllowed(
		{
			authorization: request.headers.get('authorization'),
			viaCloudflare: request.headers.has('cf-connecting-ip'),
			address: clientAddress(getClientAddress)
		},
		{ token: STATUS_TOKEN, cidrs: STATUS_ALLOW_CIDR }
	);
	if (!allowed) {
		return json(
			{ error: 'unauthorized' },
			{ status: 401, headers: { ...cacheControl('none'), 'www-authenticate': 'Bearer' } }
		);
	}
	return json(statusDocument(), { headers: cacheControl('none') });
};

function clientAddress(get: () => string): string | undefined {
	try {
		return get();
	} catch {
		return undefined;
	}
}
