import { BlockList, isIP, isIPv4 } from 'node:net';
import { timingSafeEqual } from 'node:crypto';
import { parseCidr } from './env.ts';

// Who may read GET /api/status (ADR-062). It reveals riot-proxy's health and
// the site's traffic, so it is never public.
//
// Production listens on 127.0.0.1 and is reached only through cloudflared, also
// on loopback, so every request arrives from 127.0.0.1 (ADDRESS_HEADER is
// unset). A request through Cloudflare always carries Cf-Connecting-Ip, set by
// Cloudflare whatever the visitor sent, so one that has it needs the token
// whatever its address. Only a request made on the host itself, or from a
// configured network, goes without.

export interface StatusRequest {
	/** The Authorization header, if any. */
	authorization: string | null;
	/** Whether the request came through Cloudflare (it has Cf-Connecting-Ip). */
	viaCloudflare: boolean;
	/** The connecting address SvelteKit reports; undefined if it can't tell. */
	address: string | undefined;
}

export interface StatusAccessConfig {
	token: string | undefined;
	cidrs: string[];
}

export function statusAccessAllowed(request: StatusRequest, config: StatusAccessConfig): boolean {
	if (config.token && bearerMatches(request.authorization, config.token)) return true;
	if (request.viaCloudflare || !request.address || isIP(request.address) === 0) return false;
	return trustedNetworks(config.cidrs).check(...addressAndFamily(request.address));
}

function bearerMatches(header: string | null, token: string): boolean {
	const match = /^Bearer +(\S+)\s*$/i.exec(header ?? '');
	if (!match?.[1]) return false;
	const given = Buffer.from(match[1]);
	const expected = Buffer.from(token);
	return given.length === expected.length && timingSafeEqual(given, expected);
}

const lists = new Map<string, BlockList>();

/** Loopback, and the configured networks. */
function trustedNetworks(cidrs: string[]): BlockList {
	const key = cidrs.join(',');
	let list = lists.get(key);
	if (!list) {
		list = new BlockList();
		list.addSubnet('127.0.0.0', 8, 'ipv4');
		list.addAddress('::1', 'ipv6');
		for (const cidr of cidrs) {
			const parsed = parseCidr(cidr);
			if (parsed) list.addSubnet(parsed.network, parsed.prefix, parsed.family);
		}
		lists.set(key, list);
	}
	return list;
}

/** Node reports IPv4 clients of a dual-stack socket as `::ffff:127.0.0.1`. */
function addressAndFamily(address: string): [string, 'ipv4' | 'ipv6'] {
	const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/i.exec(address)?.[1];
	if (mapped) return [mapped, 'ipv4'];
	return [address, isIPv4(address) ? 'ipv4' : 'ipv6'];
}
