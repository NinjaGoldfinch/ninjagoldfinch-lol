import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// ADR-053: a release reaches production only through deploy.yml and the shared
// ninja-actions deploy action, behind the prod environment's approval.
const root = join(import.meta.dirname, '../..');
const read = (path: string) => readFileSync(join(root, path), 'utf8');
const deploy = read('.github/workflows/deploy.yml');
const release = read('.github/workflows/release.yml');

describe('the deploy workflow', () => {
	it('runs by hand, or from release.yml, for a release tag', () => {
		expect(deploy).toMatch(/^on:\n {2}workflow_dispatch:\n/m);
		expect(deploy).toMatch(/^ {2}workflow_call:\n/m);
		expect(deploy).not.toMatch(/^ {2}(push|pull_request|release|schedule|workflow_run):/m);
		const version = /^ {6}version:\n(?: {8}.*\n)*? {8}required: true$/gm;
		expect([...deploy.matchAll(version)]).toHaveLength(2);
	});

	it('deploys to staging or prod, in that environment', () => {
		expect(deploy).toMatch(/^ {8}options: \[staging, prod\]$/m);
		expect(deploy).toMatch(/^ {8}default: staging$/m);
		expect(deploy).toMatch(/^ {4}environment: \$\{\{ inputs\.env \}\}$/m);
	});

	// A called workflow takes any string, and an unknown environment would be
	// created unprotected before the deploy job runs.
	it('refuses any other environment before it starts one', () => {
		expect(deploy).toMatch(/^ {2}deploy:\n(?: {4}.*\n)*? {4}needs: check$/m);
		expect(deploy).toMatch(/^ {10}staging \| prod\) /m);
		expect(deploy).toMatch(/^ {10}\*\) echo "::error::.*"; exit 1 ;;$/m);
	});

	it('never runs two deploys to one environment at once', () => {
		expect(deploy).toMatch(
			/^ {4}concurrency:\n {6}group: deploy-\$\{\{ inputs\.env \}\}\n {6}cancel-in-progress: false$/m
		);
	});

	it('goes through the shared deploy action, v1', () => {
		const uses = [...deploy.matchAll(/uses: (\S+)/g)].map((m) => m[1]);
		expect(uses).toEqual(['NinjaGoldfinch/ninja-actions/deploy@v1']);
	});

	// The origin is fixed at build time, so each environment has its own tarball (ADR-057).
	it("deploys the environment's own tarball, checked by its default SHA256SUMS", () => {
		expect(deploy).toMatch(/^ {2}SERVICE: ninjagoldfinch-lol$/m);
		expect(deploy).toContain(
			"ASSET: ${{ inputs.env == 'staging' && 'ninjagoldfinch-lol-staging.tar.gz' || 'ninjagoldfinch-lol.tar.gz' }}"
		);
		expect(release).toMatch(
			/^ {12}ninjagoldfinch-lol\.tar\.gz ninjagoldfinch-lol-staging\.tar\.gz SHA256SUMS$/m
		);
		expect(deploy).not.toContain('checksums:');
	});

	it('reads only, with the host and key from the environment', () => {
		expect(deploy).toMatch(/^permissions:\n {2}contents: read$/m);
		expect(deploy).not.toMatch(/: write$/m);
		expect(deploy).toContain('host: ${{ vars.DEPLOY_HOST }}');
		expect(deploy).toContain('known-hosts: ${{ vars.DEPLOY_KNOWN_HOSTS }}');
		expect(deploy).toContain('ssh-key: ${{ secrets.DEPLOY_SSH_KEY }}');
		expect([...deploy.matchAll(/secrets\.(\w+)/g)].map((m) => m[1])).toEqual(['DEPLOY_SSH_KEY']);
	});

	it('runs on the self-hosted runner', () => {
		const runners = [...deploy.matchAll(/runs-on: (.+)/g)].map((m) => m[1]);
		expect(runners).toEqual(['[self-hosted, linux, proxmox]', '[self-hosted, linux, proxmox]']);
	});
});

describe('release.yml', () => {
	// Every release goes to staging with no approval; prod stays by hand (ADR-057).
	it('deploys every published release to staging, and only to staging', () => {
		expect(release).toMatch(
			/^ {2}staging:\n(?: {4}.*\n)*? {4}needs: release\n(?: {4}.*\n)*? {4}uses: \.\/\.github\/workflows\/deploy\.yml\n {4}with:\n {6}env: staging\n {6}version: \$\{\{ github\.ref_name \}\}$/m
		);
		expect(release).not.toMatch(/env: prod/);
		expect(release).not.toContain('secrets: inherit');
	});
});
