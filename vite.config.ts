import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vitest/config';
import adapter from '@sveltejs/adapter-node';
import { sveltekit } from '@sveltejs/kit/vite';
import { CSP_DIRECTIVES } from './src/lib/server/security.ts';

export default defineConfig({
	// The build's identity, baked in: scripts/package.sh sets BUILD_VERSION,
	// BUILD_COMMIT and BUILD_TIME (its version.json's); any other build reports
	// `dev`, built now (ADR-061).
	define: {
		__BUILD__: JSON.stringify({
			version: process.env.BUILD_VERSION,
			commit: process.env.BUILD_COMMIT,
			builtAt: process.env.BUILD_TIME || new Date().toISOString().replace(/\.\d+Z$/, 'Z')
		})
	},
	plugins: [
		tailwindcss(),
		sveltekit({
			compilerOptions: {
				// Force runes mode for the project, except for libraries. Can be removed in svelte 6.
				runes: ({ filename }) =>
					filename.split(/[/\\]/).includes('node_modules') ? undefined : true
			},
			// scripts/package.sh builds a release outside the checkout's build/ (ADR-052).
			adapter: adapter({ out: process.env.BUILD_OUT ?? 'build' }),
			// Hashes, not nonces: pages are cached at the edge and shared (ADR-055).
			csp: { mode: 'hash', directives: CSP_DIRECTIVES },
			// adapter-node 6 no longer reads ORIGIN at runtime; without this it guesses
			// the origin from the Host header and assumes https. Set at build time.
			// ADR-014.
			...(process.env.ORIGIN ? { paths: { origin: process.env.ORIGIN } } : {})
		})
	],
	test: {
		expect: { requireAssertions: true },
		projects: [
			{
				extends: './vite.config.ts',
				test: {
					name: 'server',
					environment: 'node',
					include: ['tests/unit/**/*.test.ts'],
					// proxy.test.ts collects garbage while a deadline runs (RV-03).
					execArgv: ['--expose-gc']
				}
			}
		]
	}
});
