// Checks docs/PROGRESS.md against docs/IMPLEMENTATION.md (ADR-069, FIX-12,
// FIX-15). A task id may appear once as a task item, whether open (`- [ ]`),
// ticked (`- [x]`) or dropped (`- [~]`), so a section repeated by a merge fails
// whatever its ticks. A ticked or dropped id from a family the plan defines
// (P0 to P5, FP, SPD, VS, RV, ...) must be a task in the plan. Families the
// plan does not define (FIX, DEP, STAT, ...) are defined in PROGRESS.md itself
// and are checked only for duplicates. The families are read from the plan,
// not listed here.
//
// usage: node scripts/check-progress.ts [repo root]
import { readFileSync, realpathSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

/** A task item in either file: `- [ ]`, `- [x]` or `- [~]`, then the id. */
const ITEM = /^- \[([ x~])\] ([A-Z][A-Z0-9]*-\d+)\b/;

const family = (id: string): string => id.slice(0, id.lastIndexOf('-'));

/** The task ids docs/IMPLEMENTATION.md defines, as list items with a checkbox. */
export function planTasks(plan: string): Set<string> {
	const ids = new Set<string>();
	for (const line of plan.split('\n')) {
		const m = ITEM.exec(line);
		if (m) ids.add(m[2]);
	}
	return ids;
}

/** Every problem in PROGRESS.md, one line each, with its line number. Empty when it is sound. */
export function checkProgress(progress: string, plan: string): string[] {
	const defined = planTasks(plan);
	const families = new Set([...defined].map(family));
	const seen = new Map<string, number>();
	const problems: string[] = [];
	progress.split('\n').forEach((line, i) => {
		const m = ITEM.exec(line);
		if (!m) return;
		const id = m[2];
		const n = i + 1;
		const first = seen.get(id);
		if (first !== undefined) {
			problems.push(`docs/PROGRESS.md:${n}: ${id} is listed again (first at line ${first})`);
		} else {
			seen.set(id, n);
		}
		if (m[1] !== ' ' && families.has(family(id)) && !defined.has(id)) {
			problems.push(
				`docs/PROGRESS.md:${n}: ${id} is not a task in docs/IMPLEMENTATION.md, which defines the ${family(id)} tasks`
			);
		}
	});
	return problems;
}

/** Reads both files under `root`, prints the problems and a summary line, and returns the exit code. */
export function main(root: string): number {
	const read = (file: string) => readFileSync(join(root, 'docs', file), 'utf8');
	const plan = read('IMPLEMENTATION.md');
	const progress = read('PROGRESS.md');
	const problems = checkProgress(progress, plan);
	for (const problem of problems) console.error(problem);
	const ticks = progress.split('\n').filter((l) => /^- \[[x~]\] /.test(l)).length;
	console.log(
		`progress check: ${ticks} ticks against ${planTasks(plan).size} plan tasks, ${problems.length} problems`
	);
	return problems.length ? 1 : 0;
}

/** Whether this file is the script Node was started with, also through a symlinked path. */
function isEntry(): boolean {
	if (!process.argv[1]) return false;
	try {
		return fileURLToPath(import.meta.url) === realpathSync(process.argv[1]);
	} catch {
		return false;
	}
}

if (isEntry()) {
	process.exit(main(process.argv[2] ?? join(dirname(fileURLToPath(import.meta.url)), '..')));
}
