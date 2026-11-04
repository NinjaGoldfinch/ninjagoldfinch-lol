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

	it('goes through the shared deploy action, v1, and pins anything else', () => {
		const uses = [...deploy.matchAll(/\buses: (\S+)/g)].map((m) => m[1]);
		expect(uses[0]).toBe('NinjaGoldfinch/ninja-actions/deploy@v1');
		for (const use of uses.slice(1)) expect(use).toMatch(/@[0-9a-f]{40}$/);
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

	it('reads, and writes only commit statuses, with the host and keys from the environment', () => {
		expect(deploy).toMatch(/^permissions:\n {2}contents: read$/m);
		expect([...deploy.matchAll(/^ *(\w[\w-]*): write$/gm)].map((m) => m[1])).toEqual(['statuses']);
		expect(deploy).toMatch(
			/^ {4}permissions:\n {6}contents: read\n(?: {6}#.*\n)* {6}statuses: write$/m
		);
		expect(deploy).toContain('host: ${{ vars.DEPLOY_HOST }}');
		expect(deploy).toContain('known-hosts: ${{ vars.DEPLOY_KNOWN_HOSTS }}');
		expect(deploy).toContain('ssh-key: ${{ secrets.DEPLOY_SSH_KEY }}');
		expect([...deploy.matchAll(/secrets\.(\w+)/g)].map((m) => m[1])).toEqual([
			'DEPLOY_SSH_KEY',
			'CF_ACCESS_CLIENT_ID',
			'CF_ACCESS_CLIENT_SECRET'
		]);
	});

	it('runs on the self-hosted runner', () => {
		const runners = [...deploy.matchAll(/runs-on: (.+)/g)].map((m) => m[1]);
		expect(runners).toEqual(['[self-hosted, linux, proxmox]', '[self-hosted, linux, proxmox]']);
	});
});

// ADR-060: nothing reaches prod that has not passed on staging.
describe('the prod gate', () => {
	it('deploys to prod only a version that passed staging, or was live in prod', () => {
		expect(deploy).toContain(
			"require-status: ${{ inputs.env == 'prod' && 'staging/smoke prod/deployed' || '' }}"
		);
		expect(deploy).toContain("set-status: ${{ inputs.env == 'prod' && 'prod/deployed' || '' }}");
	});

	it('can be broken only by hand, with a reason', () => {
		expect(deploy).toContain('unverified-reason: ${{ inputs.break_glass }}');
		const dispatch = deploy.slice(
			deploy.indexOf('workflow_dispatch:'),
			deploy.indexOf('workflow_call:')
		);
		const call = deploy.slice(deploy.indexOf('workflow_call:'), deploy.indexOf('\npermissions:'));
		expect(dispatch).toMatch(/^ {6}break_glass:\n(?: {8}.*\n)*? {8}default: ''$/m);
		expect(call).not.toContain('break_glass');
		expect(release).not.toContain('break_glass');
	});
});

describe('the staging smoke test', () => {
	it('runs on staging only, through Access, after the deploy', () => {
		const action = deploy.indexOf('uses: NinjaGoldfinch/ninja-actions/deploy@v1');
		const smoke = deploy.indexOf('- name: Smoke test staging');
		expect(action).toBeGreaterThan(-1);
		expect(smoke).toBeGreaterThan(action);
		const step = deploy.slice(smoke, deploy.indexOf('- name: Record staging/smoke'));
		expect(step).toMatch(/^ {8}if: inputs\.env == 'staging'$/m);
		expect(step).toContain('CF_ACCESS_CLIENT_ID: ${{ secrets.CF_ACCESS_CLIENT_ID }}');
		expect(step).toContain('CF_ACCESS_CLIENT_SECRET: ${{ secrets.CF_ACCESS_CLIENT_SECRET }}');
		expect(step).toMatch(
			/^ {8}run: scripts\/smoke\.sh https:\/\/staging\.ninjagoldfinch\.lol "\$VERSION"$/m
		);
	});

	// The gate reads this status; a failure is recorded too, and only success passes.
	it("records its result, pass or fail, as staging/smoke on the version's commit", () => {
		const step = deploy.slice(deploy.indexOf('- name: Record staging/smoke'));
		expect(step).toContain(
			"if: always() && inputs.env == 'staging' && (steps.smoke.outcome == 'success' || steps.smoke.outcome == 'failure')"
		);
		expect(step).toContain('gh api "repos/$GITHUB_REPOSITORY/commits/$VERSION" --jq .sha');
		expect(step).toContain('-f state="$OUTCOME" -f context=staging/smoke');
	});

	it('gets the permission to record it from release.yml', () => {
		expect(release).toMatch(
			/^ {2}staging:\n(?: {4}.*\n)*? {6}statuses: write\n(?: {4}.*\n)*? {4}uses: \.\/\.github\/workflows\/deploy\.yml$/m
		);
	});
});

describe('release.yml', () => {
	// Every release goes to staging with no approval; prod stays by hand (ADR-057).
	it('deploys every published release to staging, and only to staging', () => {
		expect(release).toMatch(
			/^ {2}staging:\n(?: {4}.*\n)*? {4}needs: release\n(?: {4}.*\n)*? {4}uses: \.\/\.github\/workflows\/deploy\.yml\n {4}with:\n {6}env: staging\n {6}version: \$\{\{ github\.ref_name \}\}$/m
		);
		expect(release).not.toMatch(/env: prod/);
	});

	// A called workflow sees only the secrets its caller passes on, even those of
	// its own environment: without this, v1.0.3's staging deploy got an empty
	// DEPLOY_SSH_KEY while the environment's variables arrived (ADR-057).
	it("passes secrets on to the staging deploy, so it gets its environment's key", () => {
		expect(release).toMatch(/^ {2}staging:\n(?: {4}.*\n)*? {4}secrets: inherit$/m);
		expect([...release.matchAll(/secrets: inherit/g)]).toHaveLength(1);
	});
});
