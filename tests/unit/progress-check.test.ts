import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { checkProgress, planTasks } from '../../scripts/check-progress.ts';

// ADR-069 (FIX-12, FIX-15): the gate reads docs/PROGRESS.md, so a task listed
// twice, ticked or not, or a tick for a task the plan does not define fails
// `just check`.
const root = join(import.meta.dirname, '../..');
const script = join(root, 'scripts/check-progress.ts');
const read = (file: string) => readFileSync(join(root, file), 'utf8');

const plan = `# Plan

## P5 — Production

- [ ] P5-01 Dockerfile
- [ ] P5-02 Cloudflare

## SPD — speed

- [ ] SPD-01 spec refreshed
- [ ] SPD-02 Dropped: streaming
`;

const sound = `# Progress

- [x] P5-01 Dockerfile — #13
- [x] P5-02 Cloudflare — #135
  - a note under P5-02, not a tick
- [~] SPD-02 Dropped
- [x] FIX-01 A fix defined only here — #65
- [ ] SPD-01 not done yet
`;

describe('checkProgress', () => {
	it('reads the task ids and their families from the plan', () => {
		expect([...planTasks(plan)]).toEqual(['P5-01', 'P5-02', 'SPD-01', 'SPD-02']);
	});

	it('passes a progress file whose ticks are unique and defined', () => {
		expect(checkProgress(sound, plan)).toEqual([]);
	});

	it('fails a task ticked twice, naming both lines', () => {
		const twice = sound + '- [x] P5-02 Cloudflare, again — #134\n';
		expect(checkProgress(twice, plan)).toEqual([
			'docs/PROGRESS.md:9: P5-02 is listed again (first at line 4)'
		]);
	});

	it('fails a dropped task that is also ticked', () => {
		const both = sound + '- [x] SPD-02 done after all\n';
		expect(checkProgress(both, plan)).toEqual([
			'docs/PROGRESS.md:9: SPD-02 is listed again (first at line 6)'
		]);
	});

	it("fails a ticked id from one of the plan's families that the plan does not define", () => {
		const unknown = sound + '- [x] P5-06 Something new — #140\n';
		expect(checkProgress(unknown, plan)).toEqual([
			'docs/PROGRESS.md:9: P5-06 is not a task in docs/IMPLEMENTATION.md, which defines the P5 tasks'
		]);
	});

	it('leaves a family the plan does not define to PROGRESS.md', () => {
		const fixes = sound + '- [x] FIX-12 A new fix — #142\n- [x] DEP-01 CI — #99\n';
		expect(checkProgress(fixes, plan)).toEqual([]);
	});

	it('fails an id listed twice when one copy is not ticked, either way round', () => {
		expect(checkProgress(sound + '- [ ] P5-02 Cloudflare, open again\n', plan)).toEqual([
			'docs/PROGRESS.md:9: P5-02 is listed again (first at line 4)'
		]);
		expect(checkProgress(sound + '- [x] SPD-01 done — #70\n', plan)).toEqual([
			'docs/PROGRESS.md:9: SPD-01 is listed again (first at line 8)'
		]);
	});

	it('fails an id listed twice with neither copy ticked', () => {
		const open = '- [ ] P5-01 Dockerfile\n- [ ] P5-01 Dockerfile\n';
		expect(checkProgress(open, plan)).toEqual([
			'docs/PROGRESS.md:2: P5-01 is listed again (first at line 1)'
		]);
	});

	it('fails a section a merge duplicated, whatever the ticks in each copy', () => {
		const section = (a: string, b: string) =>
			`## P5 — Production\n\n- [${a}] P5-01 Dockerfile\n- [${b}] P5-02 Cloudflare\n\n`;
		const merged = section('x', ' ') + section(' ', 'x');
		expect(checkProgress(merged, plan)).toEqual([
			'docs/PROGRESS.md:8: P5-01 is listed again (first at line 3)',
			'docs/PROGRESS.md:9: P5-02 is listed again (first at line 4)'
		]);
	});

	it('ignores an unticked id the plan does not define, and lines that are not task items', () => {
		const other = sound + '- [ ] P5-99 planned, not a tick\n- P5-98 is mentioned in prose\n';
		expect(checkProgress(other, plan)).toEqual([]);
	});

	it('passes the repository as it is', () => {
		expect(checkProgress(read('docs/PROGRESS.md'), read('docs/IMPLEMENTATION.md'))).toEqual([]);
	});
});

describe('scripts/check-progress.ts', () => {
	const dirs: string[] = [];
	afterEach(() => {
		for (const dir of dirs) rmSync(dir, { recursive: true, force: true });
		dirs.length = 0;
	});

	/** A scratch repo root holding only the two files the check reads. */
	function repo(progress: string): string {
		const dir = mkdtempSync(join(tmpdir(), 'progress-check-'));
		dirs.push(dir);
		mkdirSync(join(dir, 'docs'));
		writeFileSync(join(dir, 'docs/IMPLEMENTATION.md'), plan);
		writeFileSync(join(dir, 'docs/PROGRESS.md'), progress);
		return dir;
	}

	function run(dir: string): { status: number; stdout: string; stderr: string } {
		try {
			const stdout = execFileSync(process.execPath, [script, dir], {
				encoding: 'utf8',
				stdio: ['ignore', 'pipe', 'pipe']
			});
			return { status: 0, stdout, stderr: '' };
		} catch (e) {
			const err = e as { status: number; stdout: string; stderr: string };
			return { status: err.status, stdout: err.stdout, stderr: err.stderr };
		}
	}

	it('exits 0 with a summary on a sound progress file', () => {
		const r = run(repo(sound));
		expect(r.status).toBe(0);
		expect(r.stdout).toBe('progress check: 4 ticks against 4 plan tasks, 0 problems\n');
	});

	it('exits 1 and names the line on a duplicated tick', () => {
		const r = run(repo(sound + '- [x] P5-02 Cloudflare, again — #134\n'));
		expect(r.status).toBe(1);
		expect(r.stderr).toContain('docs/PROGRESS.md:9: P5-02 is listed again (first at line 4)');
		expect(r.stdout).toContain('1 problems');
	});

	it('exits 1 on a ticked id the plan does not define', () => {
		const r = run(repo(sound + '- [x] P5-06 Something new — #140\n'));
		expect(r.status).toBe(1);
		expect(r.stderr).toContain('P5-06 is not a task in docs/IMPLEMENTATION.md');
	});

	it('fails the same when started through a symlinked path', () => {
		const dir = repo(sound + '- [ ] P5-02 Cloudflare, open again\n');
		const link = join(dir, 'checkout');
		symlinkSync(root, link, 'dir');
		let status = 0;
		let stderr = '';
		try {
			execFileSync(process.execPath, [join(link, 'scripts/check-progress.ts'), dir], {
				encoding: 'utf8',
				stdio: ['ignore', 'pipe', 'pipe']
			});
		} catch (e) {
			({ status, stderr } = e as { status: number; stderr: string });
		}
		expect(status).toBe(1);
		expect(stderr).toContain('docs/PROGRESS.md:9: P5-02 is listed again (first at line 4)');
	});

	it('exits 0 on the repository as it is', () => {
		expect(run(root).status).toBe(0);
	});
});
