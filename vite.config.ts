import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vitest/config';
import adapter from '@sveltejs/adapter-node';
import { sveltekit } from '@sveltejs/kit/vite';

export default defineConfig({
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
