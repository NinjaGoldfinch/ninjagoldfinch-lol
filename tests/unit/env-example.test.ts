import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = join(import.meta.dirname, '../..');
const read = (file: string) => readFileSync(join(root, file), 'utf8');

/** adapter-node's own settings and the build-time origin, which src/env.ts does not declare. */
const SERVER = ['HOST', 'ORIGIN', 'PORT'];

describe('.env.example', () => {
	it('lists every variable src/env.ts declares, and the server settings, and nothing else', () => {
		const declared = [...read('src/env.ts').matchAll(/^\t([A-Z_]+): \{/gm)].map((m) => m[1]);
		const listed = [...read('.env.example').matchAll(/^([A-Z_]+)=/gm)].map((m) => m[1]);

		expect(declared).toContain('PROXY_URL');
		expect(listed.toSorted()).toEqual([...declared, ...SERVER].toSorted());
	});
});
