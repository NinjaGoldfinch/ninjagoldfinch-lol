// Narrowing for parsed JSON, so fields are read without casts.

/** A JSON object, or undefined for anything else (arrays included). */
export function record(value: unknown): Record<string, unknown> | undefined {
	return typeof value === 'object' && value !== null && !Array.isArray(value)
		? (value as Record<string, unknown>)
		: undefined;
}
