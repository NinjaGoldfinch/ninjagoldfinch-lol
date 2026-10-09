import { defineConfig } from '@playwright/test';

const MOCK_PROXY_PORT = 8787;

const ORIGIN = 'http://localhost:4173';

// The site runs as the real production server (`node build`, adapter-node)
// against the mock riot-proxy, which replays tests/fixtures/. Nothing reaches
// the real proxy or Riot.
export default defineConfig({
	testDir: 'tests/e2e',
	use: { baseURL: ORIGIN },
	webServer: [
		{
			command: `node tests/mock-proxy/server.ts ${MOCK_PROXY_PORT}`,
			port: MOCK_PROXY_PORT
		},
		{
			command: 'pnpm build && node build',
			url: `${ORIGIN}/healthz`,
			env: {
				ORIGIN,
				PORT: '4173',
				NODE_ENV: 'production',
				PROXY_URL: `http://127.0.0.1:${MOCK_PROXY_PORT}`,
				PROXY_KEY: 'e2e-placeholder',
				// The mock also replays the CommunityDragon fixture.
				CDRAGON_URL: `http://127.0.0.1:${MOCK_PROXY_PORT}`
			}
		}
	]
});
