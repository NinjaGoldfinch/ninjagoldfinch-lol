import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// ADR-054: production runs the release ninja-deploy activated, through a drop-in
// on the owner's unit. ninja-deploy links /srv/<service>/current to a release.
const root = join(import.meta.dirname, '../..');
const read = (path: string) => readFileSync(join(root, path), 'utf8');
const dropin = read('deploy/systemd/ninja-deploy.conf');
const settings = dropin.split('\n').filter((line) => line !== '' && !line.startsWith('#'));
const deploy = read('.github/workflows/deploy.yml');

describe('the production drop-in', () => {
	it('replaces ExecStart and the working directory, nothing else', () => {
		expect(settings).toEqual([
			'[Service]',
			'WorkingDirectory=/srv/ninjagoldfinch-lol/current',
			'ExecStart=',
			'ExecStart=/usr/bin/node /srv/ninjagoldfinch-lol/current/build'
		]);
	});

	it('runs the service deploy.yml deploys', () => {
		const service = /^ {2}SERVICE: (\S+)$/m.exec(deploy)?.[1];
		expect(service).toBe('ninjagoldfinch-lol');
		expect(dropin).toContain(`/srv/${service}/current/build`);
	});

	// The release's tarball has build/ at its top (scripts/package.sh).
	it('starts the build/ a release carries', () => {
		expect(read('scripts/package.sh')).toContain('BUILD_OUT="$stage/build"');
	});
});
