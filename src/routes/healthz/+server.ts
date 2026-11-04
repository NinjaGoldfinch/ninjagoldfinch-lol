import { json } from '@sveltejs/kit';
import { cacheControl } from '#lib/server/cache.ts';
import { VERSION } from '#lib/server/version.ts';
import type { RequestHandler } from './$types';

// Liveness only: answers while the server is up, without touching riot-proxy.
// `version` lets a deploy tell the new release from the old one still answering.
export const GET: RequestHandler = () =>
	json({ ok: true, version: VERSION }, { headers: cacheControl('none') });
