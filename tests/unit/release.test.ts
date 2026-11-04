import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// ADR-052: a v* tag runs the gate, then builds and publishes the deploy tarball.
// scripts/package.test.sh checks the tarball itself, in the gate.
const root = join(import.meta.dirname, '../..');
const read = (path: string) => readFileSync(join(root, path), 'utf8');
const release = read('.github/workflows/release.yml');

describe('the release workflow', () => {
	it('runs on v* tags only', () => {
		expect(release).toMatch(/^on:\n {2}push:\n {4}tags: \['v\*'\]\n\n/m);
	});

	it('runs the gate before building', () => {
		expect(release).toMatch(/^ {2}ci:\n {4}uses: \.\/\.github\/workflows\/ci\.yml$/m);
		expect(release).toMatch(/^ {2}build:\n(?: {4}.*\n)*? {4}needs: ci$/m);
		expect(read('.github/workflows/ci.yml')).toMatch(/^ {2}workflow_call:$/m);
	});

	// package.sh refuses a tag that is not package.json's version (ADR-051).
	it('packages the tag with scripts/package.sh', () => {
		expect(release).toMatch(/^ {6}- run: scripts\/package\.sh "\$GITHUB_REF_NAME" dist$/m);
	});

	it('publishes the tarball and its checksums for the tag, once checked', () => {
		expect(release).toContain('sha256sum --strict -c SHA256SUMS');
		expect(release).toContain('--verify-tag');
		expect(release).toMatch(/^ {12}ninjagoldfinch-lol\.tar\.gz SHA256SUMS$/m);
	});

	it('reads by default and writes only to publish', () => {
		expect(release).toMatch(/^permissions:\n {2}contents: read$/m);
		const writes = [...release.matchAll(/contents: write/g)];
		expect(writes).toHaveLength(1);
		expect(release).toMatch(/^ {2}release:\n(?: {4}.*\n)*? {4}permissions:\n {6}contents: write$/m);
		expect(release).not.toContain('secrets.');
	});

	it('never builds a release on a hosted runner', () => {
		const runners = [...release.matchAll(/runs-on: (.+)/g)].map((m) => m[1]);
		expect(runners).toEqual(['[self-hosted, linux, proxmox]', '[self-hosted, linux, proxmox]']);
	});

	it('pins every action to a commit', () => {
		const uses = [...release.matchAll(/uses: (\S+)/g)].map((m) => m[1]);
		expect(uses.filter((use) => !use.startsWith('./'))).not.toHaveLength(0);
		for (const use of uses) if (!use.startsWith('./')) expect(use).toMatch(/@[0-9a-f]{40}$/);
	});
});

describe('the release package', () => {
	it('is tested by the gate', () => {
		expect(read('scripts/check.sh')).toMatch(/^bash scripts\/package\.test\.sh$/m);
	});

	it('is self-contained: the server bundles every package it imports', () => {
		expect(JSON.parse(read('package.json'))).not.toHaveProperty('dependencies');
	});

	it('builds outside the checkout when asked, so build/ keeps its origin', () => {
		expect(read('vite.config.ts')).toContain("adapter({ out: process.env.BUILD_OUT ?? 'build' })");
	});
});
