import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

const script = join(import.meta.dirname, '../../deploy/proxmox/test.sh');

function git(dir: string, ...args: string[]): string {
	return execFileSync(
		'git',
		['-C', dir, '-c', 'user.name=t', '-c', 'user.email=t@example.com', ...args],
		{
			encoding: 'utf8'
		}
	);
}

describe('deploy/proxmox/test.sh', () => {
	let dir = '';
	afterEach(() => rmSync(dir, { recursive: true, force: true }));

	// The pre-push hook runs the deploy test with Git's own variables set.
	it("leaves the repo in GIT_DIR alone, as a hook's would be", () => {
		dir = mkdtempSync(join(tmpdir(), 'ngf-hook-'));
		git(dir, 'init', '-q');
		git(dir, 'commit', '-q', '--allow-empty', '-m', 'real');
		const before = git(dir, 'show-ref', '--head');

		execFileSync('bash', [script], {
			env: { ...process.env, GIT_DIR: join(dir, '.git'), GIT_WORK_TREE: dir },
			stdio: 'pipe'
		});

		expect(git(dir, 'show-ref', '--head')).toBe(before);
	});
});
