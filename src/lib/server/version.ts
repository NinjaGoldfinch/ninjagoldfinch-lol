import { version } from '../../../package.json';

// The running release, from package.json at build time. A deploy waits for /healthz
// to report the version it activated, so a release tag must match it (ADR-051).
export const VERSION: string = version;

/** What a build reports about itself on /api/version, /api/status and the start-up log. */
export interface BuildInfo {
	/** The release, `1.0.4`; `dev` for a build scripts/package.sh did not make. */
	version: string;
	/** The commit's short sha; `dev` likewise. */
	commit: string;
	/** When the build ran, RFC 3339 in UTC. */
	built_at: string;
}

/**
 * The build's identity from what `vite build` was given: scripts/package.sh sets
 * BUILD_VERSION and BUILD_COMMIT, and any other build (`just dev`, `pnpm build`,
 * the tests) reports `dev` (ADR-061). Read at build time only, never from git.
 */
export function buildInfo(injected: {
	version?: string;
	commit?: string;
	builtAt: string;
}): BuildInfo {
	const version = injected.version?.trim();
	const commit = injected.commit?.trim();
	return version && commit
		? { version, commit, built_at: injected.builtAt }
		: { version: 'dev', commit: 'dev', built_at: injected.builtAt };
}

/** This build. `__BUILD__` is replaced by vite.config.ts. */
export const BUILD: BuildInfo = buildInfo(__BUILD__);
