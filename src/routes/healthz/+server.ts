import { json } from '@sveltejs/kit';
import { cacheControl } from '#lib/server/cache.ts';
import type { RequestHandler } from './$types';

// Liveness only: answers while the server is up, without touching riot-proxy.
export const GET: RequestHandler = () => json({ ok: true }, { headers: cacheControl('none') });
