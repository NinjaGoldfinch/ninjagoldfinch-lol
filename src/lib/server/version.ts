import { version } from '../../../package.json';

// The running release, from package.json at build time. A deploy waits for /healthz
// to report the version it activated, so a release tag must match it (ADR-051).
export const VERSION: string = version;
