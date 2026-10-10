import { error, redirect } from '@sveltejs/kit';
import { matchPath } from '#lib/domain/match-detail.ts';
import { findRegion } from '#lib/domain/regions.ts';
import type { RequestHandler } from './$types';

// Match URLs named a region, which the match id's prefix already gives. Old
// links move permanently to the URL without one, keeping the query (ADR-037).
export const GET: RequestHandler = ({ params, url }) => {
	if (!findRegion(params.region)) error(404, 'Not found');
	redirect(308, matchPath(params.matchId) + url.search);
};
