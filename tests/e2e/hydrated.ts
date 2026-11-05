import type { Page } from '@playwright/test';

// The server-rendered page shows before client JavaScript has hydrated it, and
// until then a control that only applies with JavaScript (a filter that submits
// on change) does nothing. The root layout marks the document once hydrated.
export async function hydrated(page: Page) {
	await page.locator('html[data-hydrated]').waitFor({ state: 'attached' });
}
