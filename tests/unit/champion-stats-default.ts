import { vi } from 'vitest';
import type { ChampionFilter, ChampionSort } from '#lib/domain/champion-stats.ts';

/**
 * champion-stats.ts as it would be with `DEFAULT_PATCH` set to `newest`
 * (ADR-033): its default patch, the one `parseChampionFilter` falls back to
 * and `filterFields` leaves out, is riot-proxy's newest (null), not `all`.
 * The switch is a constant its functions read inside the module, so the
 * flipped module is modelled on the real one. Use it as the factory of
 * `vi.doMock('#lib/domain/champion-stats.ts', ...)` after `vi.resetModules()`,
 * then import the modules under test.
 */
export async function championStatsWithDefault(defaultPatch: 'all' | 'newest') {
	const actual = await vi.importActual<typeof import('#lib/domain/champion-stats.ts')>(
		'#lib/domain/champion-stats.ts'
	);
	if (defaultPatch === 'all') return actual;
	return {
		...actual,
		DEFAULT_PATCH: defaultPatch,
		parseChampionFilter(params: URLSearchParams): ChampionFilter {
			const filter = actual.parseChampionFilter(params);
			// `all` that the query did not name is the real module's default.
			return filter.patch === 'all' && params.get('patch') !== 'all'
				? { ...filter, patch: null }
				: filter;
		},
		filterFields(filter: ChampionFilter, sort?: ChampionSort): [string, string][] {
			const fields = actual.filterFields({ ...filter, patch: 'all' }, sort);
			if (filter.patch !== null) {
				const at = fields.findIndex(([key]) => key === 'sort');
				fields.splice(at === -1 ? fields.length : at, 0, ['patch', filter.patch]);
			}
			return fields;
		}
	};
}
