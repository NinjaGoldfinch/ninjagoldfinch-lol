import type { RequestEvent } from '@sveltejs/kit';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { handleError } from '../../src/hooks.server';

const event = {
	request: new Request('http://localhost/summoner/oce/x-OCE'),
	url: new URL('http://localhost/summoner/oce/x-OCE')
} as RequestEvent;

afterEach(() => {
	vi.restoreAllMocks();
});

describe('handleError', () => {
	it('logs unknown errors and shows a generic message', () => {
		const log = vi.spyOn(console, 'error').mockImplementation(() => {});
		const result = handleError({ kind: 'unknown', error: new Error('fetch failed'), event });

		expect(result).toEqual({ message: 'Temporarily unavailable' });
		expect(log).toHaveBeenCalledOnce();
	});

	it('keeps app and framework errors as they are', () => {
		const log = vi.spyOn(console, 'error').mockImplementation(() => {});

		expect(
			handleError({ kind: 'app', error: { status: 404, message: 'Not found' }, event })
		).toBeUndefined();
		expect(
			handleError({ kind: 'framework', error: { status: 404, message: 'Not Found' }, event })
		).toBeUndefined();
		expect(log).not.toHaveBeenCalled();
	});
});
