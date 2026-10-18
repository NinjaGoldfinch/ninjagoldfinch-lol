import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { loadFixtures } from '../mock-proxy/mock.ts';

// The fixtures stand in for riot-proxy, so they must carry what its spec
// requires: a field a newer spec adds would otherwise be missing from every
// test while the types promise it.

interface Schema {
	$ref?: string;
	type?: string | string[];
	required?: string[];
	properties?: Record<string, Schema>;
	items?: Schema;
	oneOf?: Schema[];
	anyOf?: Schema[];
}

interface Spec {
	paths: Record<
		string,
		{ get?: { responses: Record<string, { content?: Record<string, { schema?: Schema }> }> } }
	>;
	components: { schemas: Record<string, Schema> };
}

const spec = JSON.parse(
	readFileSync(join(import.meta.dirname, '../../openapi/riot-proxy.json'), 'utf8')
) as Spec;

function resolve(schema: Schema): Schema {
	let s = schema;
	while (s.$ref) s = spec.components.schemas[s.$ref.split('/').at(-1) ?? ''] ?? {};
	return s;
}

/** The 200 body's schema for a recorded request path, if the spec has the route. */
function bodySchema(path: string): Schema | undefined {
	const route = path.split('?')[0];
	for (const [template, ops] of Object.entries(spec.paths)) {
		const pattern = new RegExp(`^${template.replace(/\{[^}]+\}/g, '[^/]+')}$`);
		if (pattern.test(route))
			return ops.get?.responses['200']?.content?.['application/json']?.schema;
	}
	return undefined;
}

/** Every required field missing from `value`, as `.path.to.field`. */
function missing(value: unknown, schema: Schema, at = ''): string[] {
	const s = resolve(schema);
	const alternatives = s.oneOf ?? s.anyOf;
	if (alternatives) {
		const nonNull = alternatives.filter((a) => resolve(a).type !== 'null');
		return value !== null && nonNull.length === 1 ? missing(value, nonNull[0], at) : [];
	}
	if (Array.isArray(value)) {
		return s.items ? value.flatMap((v) => missing(v, s.items as Schema, `${at}[]`)) : [];
	}
	if (value === null || typeof value !== 'object' || !s.properties) return [];
	const record = value as Record<string, unknown>;
	const props = s.properties;
	return [
		...(s.required ?? []).filter((k) => !(k in record)).map((k) => `${at}.${k}`),
		...Object.entries(record).flatMap(([k, v]) =>
			props[k] ? missing(v, props[k], `${at}.${k}`) : []
		)
	];
}

/** The lower bound of the 95 % Wilson score interval, rounded as riot-proxy's rates are. */
function wilsonLow(wins: number, games: number): number {
	if (games === 0) return 0;
	const z = 1.96;
	const p = wins / games;
	const low =
		(p +
			(z * z) / (2 * games) -
			z * Math.sqrt((p * (1 - p)) / games + (z * z) / (4 * games ** 2))) /
		(1 + (z * z) / games);
	return Math.round(low * 10_000) / 10_000;
}

const recorded = loadFixtures().filter(
	(f) => f.request.method === 'GET' && f.response.status === 200
);

describe('fixtures against the spec', () => {
	it('carry every field the spec requires of a 200 body', () => {
		const gaps = recorded.flatMap((f) => {
			const schema = bodySchema(f.request.path);
			return schema ? missing(f.response.body, schema).map((m) => `${f.request.path} ${m}`) : [];
		});
		expect(gaps).toEqual([]);
	});

	it('cover the analytics routes', () => {
		const analytics = recorded.filter((f) => f.request.path.startsWith('/v1/lol/analytics/'));
		expect(analytics.length).toBeGreaterThan(0);
		expect(analytics.every((f) => bodySchema(f.request.path))).toBe(true);
	});
});

describe('winRateLow in the builds fixtures', () => {
	it("matches ADR-171's worked values", () => {
		expect(wilsonLow(7, 10)).toBe(0.3968);
		expect(wilsonLow(1, 1)).toBe(0.2065);
		expect(wilsonLow(0, 0)).toBe(0);
	});

	it('is the Wilson lower bound of each build', () => {
		const builds = recorded.flatMap((f) => {
			const body = f.response.body as {
				builds?: { wins: number; games: number; winRateLow: number }[];
			};
			return f.request.path.includes('/builds') ? (body.builds ?? []) : [];
		});
		expect(builds.length).toBeGreaterThan(0);
		for (const b of builds) expect(b.winRateLow).toBe(wilsonLow(b.wins, b.games));
	});
});
