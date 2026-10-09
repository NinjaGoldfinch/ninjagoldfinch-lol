// Runs the mock riot-proxy for Playwright and local use.
//
//   node tests/mock-proxy/server.ts [port]

import { createMockProxy, loadFixtures } from './mock.ts';

const port = Number(process.argv[2] ?? 8787);
const fixtures = loadFixtures();

createMockProxy(fixtures).listen(port, '127.0.0.1', () => {
	console.log(`mock-proxy: ${fixtures.length} fixtures on http://127.0.0.1:${port}`);
});
