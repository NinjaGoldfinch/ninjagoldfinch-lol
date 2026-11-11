import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { loadFixtures } from '../mock-proxy/mock.ts';

// Counts the docs state that drift when a fixture or a riot-proxy call is
// added or removed: FP-08 and FP-09 left them stale, and FIX-19 corrected
// them by hand. Each is checked against what it counts.
const root = join(import.meta.dirname, '../..');
const read = (file: string) => readFileSync(join(root, file), 'utf8');

const UNITS = [
	'zero',
	'one',
	'two',
	'three',
	'four',
	'five',
	'six',
	'seven',
	'eight',
	'nine',
	'ten',
	'eleven',
	'twelve',
	'thirteen',
	'fourteen',
	'fifteen',
	'sixteen',
	'seventeen',
	'eighteen',
	'nineteen'
];
const TENS = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety'];

/** `Thirteen` is 13, `twenty-one` 21; anything else, 100 and over included, is NaN. */
function spelledNumber(words: string): number {
	const [tens, unit, ...rest] = words.toLowerCase().split('-');
	if (rest.length > 0) return NaN;
	if (unit === undefined) {
		const small = UNITS.indexOf(tens);
		if (small !== -1) return small;
		const t = TENS.indexOf(tens);
		return t >= 2 ? t * 10 : NaN;
	}
	const t = TENS.indexOf(tens);
	const u = UNITS.indexOf(unit);
	return t >= 2 && u >= 1 && u <= 9 ? t * 10 + u : NaN;
}

/** A doc's section from its `## ` heading to the next; fails the test when the heading is missing. */
function section(doc: string, heading: string): string {
	const start = doc.indexOf(`\n${heading}\n`);
	expect(start, heading).not.toBe(-1);
	const rest = doc.slice(start + heading.length + 2);
	const end = rest.indexOf('\n## ');
	return end === -1 ? rest : rest.slice(0, end);
}

/** The body rows of a section's first Markdown table, without its header and separator. */
function tableRows(text: string): string[] {
	const lines = text.split('\n');
	const start = lines.findIndex((line) => line.startsWith('|'));
	const end = lines.findIndex((line, i) => i > start && !line.startsWith('|'));
	return start === -1 ? [] : lines.slice(start + 2, end === -1 ? undefined : end);
}

/** The first capture of `pattern` in `text`; fails the test when it does not match. */
function captured(text: string, pattern: RegExp): string {
	const match = pattern.exec(text);
	expect(match, String(pattern)).not.toBeNull();
	return match?.[1] ?? '';
}

describe('spelledNumber', () => {
	it('reads the numbers a doc spells out', () => {
		expect(spelledNumber('Thirteen')).toBe(13);
		expect(spelledNumber('one')).toBe(1);
		expect(spelledNumber('Twenty')).toBe(20);
		expect(spelledNumber('twenty-one')).toBe(21);
		expect(spelledNumber('Ninety-nine')).toBe(99);
	});

	it('is NaN for anything else', () => {
		for (const words of ['', '13', 'twenty-', 'twenty-ten', 'ten-one', 'a-b-c', 'hundred']) {
			expect(spelledNumber(words), words).toBeNaN();
		}
	});
});

describe('counts in the docs', () => {
	it("give the mock's number of fixtures", () => {
		const fixtures = loadFixtures().length;
		const testing = captured(
			read('docs/workflows/testing.md'),
			/^\| `tests\/fixtures\/\*\.json` +\| (\d+) fixtures:/m
		);
		const setup = captured(
			read('docs/workflows/development-setup.md'),
			/^ *# mock-proxy: (\d+) fixtures on /m
		);

		expect(fixtures).toBeGreaterThan(0);
		expect(Number(testing), 'docs/workflows/testing.md').toBe(fixtures);
		expect(Number(setup), 'docs/workflows/development-setup.md').toBe(fixtures);
	});

	it("give the contract's routes used, out of the spec's paths", () => {
		const routes = section(read('docs/integration/contract.md'), '## Routes used');
		const [, used = '', paths = ''] =
			/^([A-Z][a-z]+(?:-[a-z]+)?) of the spec's (\d+) paths\./m.exec(routes) ?? [];
		const rows = tableRows(routes);
		const spec = JSON.parse(read('openapi/riot-proxy.json')) as { paths: object };

		expect(used, 'the spelled-out count above the table').not.toBe('');
		expect(rows.length).toBeGreaterThan(0);
		expect(rows.every((row) => row.startsWith('| `GET /v1/'))).toBe(true);
		expect(spelledNumber(used), 'routes used').toBe(rows.length);
		expect(Number(paths), "the spec's paths").toBe(Object.keys(spec.paths).length);
	});
});
