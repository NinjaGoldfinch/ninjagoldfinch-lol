import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// ADR-050: `just check`, the pre-push hook and CI run one gate, scripts/check.sh.
const root = join(import.meta.dirname, '../..');
const read = (path: string) => readFileSync(join(root, path), 'utf8');

describe('the gate', () => {
	it('is one script that `just check` runs', () => {
		expect(read('justfile')).toMatch(/^check:\n {4}bash scripts\/check\.sh\n/m);
	});

	// ADR-050's steps, the PROGRESS.md tick check after Prettier (ADR-069), then
	// the release package test (ADR-052).
	it('runs every step, in order', () => {
		const steps = read('scripts/check.sh')
			.split('\n')
			.filter((line) => /^(pnpm|bash|node) /.test(line));
		expect(steps).toEqual([
			'pnpm prettier --check .',
			'node scripts/check-progress.ts',
			'pnpm openapi-typescript openapi/riot-proxy.json -o src/lib/api/schema.d.ts --check',
			'pnpm eslint .',
			'pnpm svelte-kit sync',
			'pnpm svelte-check --tsconfig ./tsconfig.json',
			'pnpm vitest run',
			'pnpm build',
			'bash scripts/package.test.sh'
		]);
	});

	// The step lists people read: README's `just check` row and CLAUDE.md's
	// Commands block. Each names every step above, in its own words (FIX-15).
	it('is described with every step in README.md and CLAUDE.md', () => {
		const readme = read('README.md')
			.split('\n')
			.find((line) => line.startsWith('| `just check`'));
		for (const step of [
			'Prettier',
			'`docs/PROGRESS.md` tick check',
			'spec drift',
			'ESLint',
			'`svelte-kit sync`',
			'svelte-check',
			'Vitest',
			'build',
			'package test'
		]) {
			expect(readme, step).toContain(step);
		}

		const claude = /^just check {4}([^\n]*\n(?: {14}[^\n]*\n)*)/m
			.exec(read('CLAUDE.md'))?.[1]
			.replace(/\s+/g, ' ');
		for (const step of [
			'format',
			'progress ticks',
			'spec drift',
			'lint',
			'svelte-check',
			'unit tests',
			'build',
			'release package test'
		]) {
			expect(claude, step).toContain(step);
		}
	});

	it('stops at the first failing step', () => {
		expect(read('scripts/check.sh')).toContain('set -euo pipefail');
	});

	it('is what the pre-push hook runs', () => {
		expect(read('.githooks/pre-push')).toMatch(/^exec just check$/m);
	});
});

describe('CI', () => {
	const ci = read('.github/workflows/ci.yml');

	it('runs the gate on pull requests and on main', () => {
		expect(ci).toMatch(/^ {2}pull_request:/m);
		expect(ci).toMatch(/^ {2}push:\n {4}branches: \[main\]/m);
		expect(ci).toMatch(/^ {6}- run: scripts\/check\.sh$/m);
	});

	it('never runs a fork on the self-hosted runner', () => {
		expect(ci).toContain(
			'runs-on: ${{ github.event.pull_request.head.repo.fork && \'ubuntu-24.04\' || fromJSON(\'["self-hosted","linux","proxmox"]\') }}'
		);
	});

	it('gets a read-only token and no secrets', () => {
		expect(ci).toMatch(/^permissions:\n {2}contents: read$/m);
		expect(ci).not.toContain('secrets.');
	});

	it('pins every action to a commit', () => {
		const uses = [...ci.matchAll(/\buses: (\S+)/g)].map((m) => m[1]);
		expect(uses.length).toBeGreaterThan(0);
		for (const use of uses) expect(use).toMatch(/@[0-9a-f]{40}$/);
	});
});

// ADR-059: the browser tests run in CI too, so every pull request and every
// release (release.yml calls ci.yml) passes them first.
describe('CI browser tests', () => {
	const ci = read('.github/workflows/ci.yml');
	const e2e = ci.slice(ci.indexOf('\n  e2e:\n'));

	it('run what `just e2e` runs', () => {
		const recipe = /^e2e:\n {4}(.+)$/m.exec(read('justfile'))?.[1];
		expect(recipe).toBe('pnpm playwright test');
		expect(e2e).toMatch(new RegExp(`^ {6}- run: ${recipe}$`, 'm'));
	});

	it('install the Chromium the locked Playwright expects, with its libraries', () => {
		expect(e2e).toMatch(/^ {6}- run: pnpm install --frozen-lockfile$/m);
		expect(e2e).toMatch(/^ {6}- run: pnpm exec playwright install --with-deps chromium$/m);
	});

	// Chromium's system libraries need root; the self-hosted runner's user has no sudo.
	it('run on a hosted runner, with no secrets', () => {
		expect(e2e).toMatch(/^ {4}runs-on: ubuntu-24\.04$/m);
		expect(e2e).not.toContain('secrets.');
		expect(e2e).not.toMatch(/^ {4}permissions:/m);
	});

	it('run before every release', () => {
		expect(read('.github/workflows/release.yml')).toMatch(
			/^ {2}ci:\n {4}uses: \.\/\.github\/workflows\/ci\.yml$/m
		);
		expect(read('.github/workflows/release.yml')).toMatch(
			/^ {2}build:\n(?: {4}.*\n)*? {4}needs: ci$/m
		);
	});
});
