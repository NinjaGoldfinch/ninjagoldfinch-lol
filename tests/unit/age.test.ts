import { describe, expect, it } from 'vitest';
import { ageSince, formatAge } from '#lib/domain/age.ts';

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

describe('ageSince', () => {
	const now = 1_762_650_000_000;

	it('words the time between two moments', () => {
		expect(ageSince(now - 120_000, now)).toBe('2 minutes ago');
		expect(ageSince(now - 30_000, now)).toBe('just now');
	});

	it('reads a moment ahead of now as just now', () => {
		expect(ageSince(now + 60_000, now)).toBe('just now');
	});
});
