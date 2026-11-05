import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

const script = join(import.meta.dirname, '../../deploy/proxmox/test.sh');

// The pre-push hook runs these tests with Git's own variables set, and from a
// worktree GIT_DIR is an absolute path into the real repo: inherited, the scratch
// `git init` below would reinitialise that repo as bare and commit into it.
function withoutGit(): NodeJS.ProcessEnv {
	return Object.fromEntries(Object.entries(process.env).filter(([k]) => !k.startsWith('GIT_')));
}

function git(dir: string, ...args: string[]): string {
	return execFileSync(
		'git',
		['-C', dir, '-c', 'user.name=t', '-c', 'user.email=t@example.com', ...args],
		{
			encoding: 'utf8',
			env: withoutGit()
		}
	);
}

describe('deploy/proxmox/test.sh', () => {
	const dirs: string[] = [];
	const scratch = (prefix: string) => {
		const dir = mkdtempSync(join(tmpdir(), prefix));
		dirs.push(dir);
		return dir;
	};
	afterEach(() => {
		for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
	});

	// The pre-push hook runs the deploy test with Git's own variables set.
	it("leaves the repo in GIT_DIR alone, as a hook's would be", () => {
		const dir = scratch('ngf-hook-');
		git(dir, 'init', '-q');
		git(dir, 'commit', '-q', '--allow-empty', '-m', 'real');
		const before = git(dir, 'show-ref', '--head');

		execFileSync('bash', [script], {
			env: { ...withoutGit(), GIT_DIR: join(dir, '.git'), GIT_WORK_TREE: dir },
			stdio: 'pipe'
		});

		expect(git(dir, 'show-ref', '--head')).toBe(before);
	});

	// As run from a worktree's hook: this test's own scratch repo stays its own.
	it("sets up its scratch repo without touching the repo in this run's GIT_DIR", () => {
		const hooked = scratch('ngf-hooked-');
		git(hooked, 'init', '-q');
		git(hooked, 'commit', '-q', '--allow-empty', '-m', 'hooked');
		git(hooked, 'worktree', 'add', '-q', join(hooked, 'wt'));
		const before = git(hooked, 'show-ref', '--head');

		const saved = process.env.GIT_DIR;
		process.env.GIT_DIR = join(hooked, '.git', 'worktrees', 'wt');
		try {
			const dir = scratch('ngf-hook-');
			git(dir, 'init', '-q');
			git(dir, 'commit', '-q', '--allow-empty', '-m', 'real');
		} finally {
			if (saved === undefined) delete process.env.GIT_DIR;
			else process.env.GIT_DIR = saved;
		}

		expect(git(hooked, 'config', '--bool', 'core.bare').trim()).toBe('false');
		expect(git(hooked, 'show-ref', '--head')).toBe(before);
	});
});
