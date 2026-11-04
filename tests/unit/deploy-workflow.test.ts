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
	it('runs only by hand, for a release tag', () => {
		expect(deploy).toMatch(/^on:\n {2}workflow_dispatch:\n/m);
		expect(deploy).not.toMatch(/^ {2}(push|pull_request|release|schedule|workflow_run):/m);
		expect(deploy).toMatch(/^ {6}version:\n {8}description: .*\n {8}required: true$/m);
	});

	it('deploys only to prod, which waits for the owner', () => {
		expect(deploy).toMatch(/^ {8}options: \[prod\]$/m);
		expect(deploy).toMatch(/^ {4}environment: \$\{\{ inputs\.env \}\}$/m);
	});

	it('never runs two deploys to one environment at once', () => {
		expect(deploy).toMatch(
			/^concurrency:\n {2}group: deploy-\$\{\{ inputs\.env \}\}\n {2}cancel-in-progress: false$/m
		);
	});

	it('goes through the shared deploy action, v1', () => {
		const uses = [...deploy.matchAll(/uses: (\S+)/g)].map((m) => m[1]);
		expect(uses).toEqual(['NinjaGoldfinch/ninja-actions/deploy@v1']);
	});

	it('deploys the asset release.yml publishes, checked by its default SHA256SUMS', () => {
		expect(deploy).toMatch(/^ {2}SERVICE: ninjagoldfinch-lol$/m);
		expect(deploy).toMatch(/^ {2}ASSET: ninjagoldfinch-lol\.tar\.gz$/m);
		expect(release).toMatch(/^ {12}ninjagoldfinch-lol\.tar\.gz SHA256SUMS$/m);
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
		expect(deploy).toMatch(/^ {4}runs-on: \[self-hosted, linux, proxmox\]$/m);
	});
});
