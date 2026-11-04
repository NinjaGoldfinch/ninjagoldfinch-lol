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

	it('runs every step it always ran, in order', () => {
		const steps = read('scripts/check.sh')
			.split('\n')
			.filter((line) => /^(pnpm|bash) /.test(line));
		expect(steps).toEqual([
			'pnpm prettier --check .',
			'pnpm openapi-typescript openapi/riot-proxy.json -o src/lib/api/schema.d.ts --check',
			'pnpm eslint .',
			'pnpm svelte-kit sync',
			'pnpm svelte-check --tsconfig ./tsconfig.json',
			'pnpm vitest run',
			'pnpm build',
			'bash deploy/proxmox/test.sh'
		]);
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
		const uses = [...ci.matchAll(/uses: (\S+)/g)].map((m) => m[1]);
		expect(uses.length).toBeGreaterThan(0);
		for (const use of uses) expect(use).toMatch(/@[0-9a-f]{40}$/);
	});
});
