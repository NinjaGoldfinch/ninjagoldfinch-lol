import { describe, expect, it } from 'vitest';
import { record } from '#lib/api/json.ts';

describe('record', () => {
	it('passes a JSON object through', () => {
		const value = { id: 1 };
		expect(record(value)).toBe(value);
	});

	it('is undefined for anything else', () => {
		expect(record(null)).toBeUndefined();
		expect(record(undefined)).toBeUndefined();
		expect(record([1, 2])).toBeUndefined();
		expect(record('text')).toBeUndefined();
		expect(record(3)).toBeUndefined();
	});
});
