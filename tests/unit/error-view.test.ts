import { describe, expect, it } from 'vitest';
import { describeError } from '#lib/domain/error-view.ts';

describe('describeError', () => {
	it('describes not found', () => {
		expect(describeError(404).title).toBe('Not found');
	});

	it('describes rate limiting with the wait time', () => {
		expect(describeError(429, 1).detail).toContain('Try again in 1 second.');
		expect(describeError(429, 30).detail).toContain('Try again in 30 seconds.');
		expect(describeError(429, 60).detail).toContain('Try again in 1 minute.');
		expect(describeError(429, 61).detail).toContain('Try again in 2 minutes.');
		expect(describeError(429).detail).toContain('Try again in a minute.');
	});

	it('describes everything else as unavailable', () => {
		for (const status of [500, 502, 503]) {
			expect(describeError(status).title).toBe('Temporarily unavailable');
		}
	});
});
