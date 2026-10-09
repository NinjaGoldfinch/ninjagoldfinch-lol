import { describe, expect, it } from 'vitest';
import { MAX_PAGE, actionUrl, filterQuery, parseMatchFilter } from '#lib/domain/match-filters.ts';

const parse = (query: string) => parseMatchFilter(new URLSearchParams(query));

describe('parseMatchFilter', () => {
	it('reads an offered queue and a page', () => {
		expect(parse('queue=420&page=2')).toEqual({ queue: 420, champion: null, page: 2 });
		expect(parse('')).toEqual({ queue: null, champion: null, page: 1 });
	});

	it('ignores queues that are not offered, including custom games', () => {
		expect(parse('queue=0').queue).toBeNull();
		expect(parse('queue=9999').queue).toBeNull();
		expect(parse('queue=').queue).toBeNull();
		expect(parse('queue=ranked').queue).toBeNull();
	});

	it("reads a champion id within riot-proxy's range", () => {
		expect(parse('champion=234').champion).toBe(234);
		expect(parse('queue=420&champion=234&page=3')).toEqual({ queue: 420, champion: 234, page: 3 });
		expect(parse('champion=0').champion).toBeNull();
		expect(parse('champion=10001').champion).toBeNull();
		expect(parse('champion=Viego').champion).toBeNull();
	});

	it("keeps the page within riot-proxy's start limit", () => {
		expect(parse(`page=${MAX_PAGE}`).page).toBe(1001);
		expect(parse(`page=${MAX_PAGE + 1}`).page).toBe(1);
		expect(parse('page=0').page).toBe(1);
		expect(parse('page=1.5').page).toBe(1);
	});
});

describe('filterQuery and actionUrl', () => {
	it('leave out defaults', () => {
		expect(filterQuery({ queue: null, champion: null, page: 1 })).toBe('');
		expect(filterQuery({ queue: 420, champion: null, page: 1 })).toBe('?queue=420');
		expect(filterQuery({ queue: null, champion: null, page: 3 })).toBe('?page=3');
	});

	it('keep the filter on a form action', () => {
		expect(actionUrl({ queue: null, champion: null, page: 1 }, 'refresh')).toBe('?/refresh');
		expect(actionUrl({ queue: 420, champion: null, page: 2 }, 'refresh')).toBe(
			'?queue=420&page=2&/refresh'
		);
		expect(actionUrl({ queue: null, champion: 234, page: 1 }, 'refresh')).toBe(
			'?champion=234&/refresh'
		);
	});

	it('round-trip through parseMatchFilter', () => {
		const filter = { queue: 450, champion: null, page: 7 };
		expect(parse(filterQuery(filter).slice(1))).toEqual(filter);
	});
});
