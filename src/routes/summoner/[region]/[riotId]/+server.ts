import { error, redirect } from '@sveltejs/kit';
import { findRegion } from '#lib/domain/regions.ts';
import { parseRiotId, profilePath } from '#lib/domain/riot-id.ts';
import type { RequestHandler } from './$types';

// Profile URLs named a region until riot-proxy could find a player's platform
// from their account. Old links move permanently to the URL without one,
// keeping the query (ADR-037).
export const GET: RequestHandler = ({ params, url }) => {
	const id = parseRiotId(params.riotId);
	if (!findRegion(params.region) || !id) error(404, 'Not found');
	redirect(308, profilePath(id) + url.search);
};
