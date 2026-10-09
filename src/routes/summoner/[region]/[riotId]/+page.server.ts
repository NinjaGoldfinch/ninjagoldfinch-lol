import { error } from '@sveltejs/kit';
import { parseAccount } from '#lib/api/riot.ts';
import { findRegion } from '#lib/domain/regions.ts';
import { parseRiotId } from '#lib/domain/riot-id.ts';
import { cacheControl } from '#lib/server/cache.ts';
import { toHttpError } from '#lib/server/errors.ts';
import { proxy } from '#lib/server/proxy.ts';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params, setHeaders }) => {
	const region = findRegion(params.region);
	const id = parseRiotId(params.riotId);
	if (!region || !id) error(404, 'Not found');

	const {
		data,
		error: apiError,
		response
	} = await proxy.GET('/v1/riot/accounts/by-riot-id/{region}/{gameName}/{tagLine}', {
		params: { path: { region: region.route, gameName: id.gameName, tagLine: id.tagLine } }
	});
	if (!response.ok) toHttpError(response, apiError);

	const account = parseAccount(data);
	if (!account) {
		console.error(`unexpected account payload for ${params.region}/${params.riotId}`);
		error(503, 'Temporarily unavailable');
	}

	setHeaders(cacheControl('profile'));
	return {
		region: { slug: region.slug, label: region.label },
		riotId: { gameName: account.gameName ?? id.gameName, tagLine: account.tagLine ?? id.tagLine }
	};
};
