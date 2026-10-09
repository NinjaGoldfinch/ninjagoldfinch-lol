import { describe, expect, it } from 'vitest';
import { formatAge } from '#lib/domain/age.ts';

describe('formatAge', () => {
	it('words an age in the largest whole unit', () => {
		expect(formatAge(0)).toBe('just now');
		expect(formatAge(59)).toBe('just now');
		expect(formatAge(60)).toBe('1 minute ago');
		expect(formatAge(213)).toBe('3 minutes ago');
		expect(formatAge(3600)).toBe('1 hour ago');
		expect(formatAge(7300)).toBe('2 hours ago');
		expect(formatAge(86400 * 5)).toBe('5 days ago');
	});
});
