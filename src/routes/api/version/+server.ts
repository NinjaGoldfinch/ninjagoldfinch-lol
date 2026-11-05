import { json } from '@sveltejs/kit';
import { cacheControl } from '#lib/server/cache.ts';
import { BUILD } from '#lib/server/version.ts';
import type { RequestHandler } from './$types';

// Public and deliberately small: the version and commit, nothing else, so a
// poller can see a deploy by the version changing (ADR-061). Never cached, or
// the edge would hide a deploy.
export const GET: RequestHandler = () =>
	json({ version: BUILD.version, commit: BUILD.commit }, { headers: cacheControl('none') });
