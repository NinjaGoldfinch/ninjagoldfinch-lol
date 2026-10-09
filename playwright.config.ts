import { defineConfig } from '@playwright/test';

const MOCK_PROXY_PORT = 8787;

// The site runs as a production build against the mock riot-proxy, which
// replays tests/fixtures/. Nothing reaches the real proxy or Riot.
export default defineConfig({
	testDir: 'tests/e2e',
	use: { baseURL: 'http://localhost:4173' },
	webServer: [
		{
			command: `node tests/mock-proxy/server.ts ${MOCK_PROXY_PORT}`,
			port: MOCK_PROXY_PORT
		},
		{
			command: 'pnpm build && pnpm preview',
			port: 4173,
			env: {
				PROXY_URL: `http://127.0.0.1:${MOCK_PROXY_PORT}`,
				PROXY_KEY: 'e2e-placeholder'
			}
		}
	]
});
