import { expect, test } from '@playwright/test';

const LEGAL = "ninjagoldfinch.lol isn't endorsed by Riot Games";

test('every page has the search form and the Riot legal notice', async ({ page }) => {
	await page.goto('/');
	const search = page.getByRole('banner').getByRole('search');
	// A Riot ID names its own region (ADR-037), so there is nothing to pick.
	await expect(search.getByRole('combobox', { name: 'Region' })).toHaveCount(0);
	// The front page suggests champions, so its box is a combobox.
	await expect(search.getByRole('combobox', { name: 'Riot ID or champion' })).toBeVisible();
	await expect(page.locator('footer')).toContainText(LEGAL);
});

test('the accent is light purple', async ({ page }) => {
	await page.goto('/');
	const name = page.getByRole('banner').getByRole('link', { name: 'ninjagoldfinch.lol' });
	const button = page.getByRole('banner').getByRole('button', { name: 'Search' });
	await expect(name).toHaveCSS('color', 'oklch(0.79 0.12 302)');
	await expect(button).toHaveCSS('background-color', 'oklch(0.79 0.12 302)');
});

test('the site icon is the lavender N on deep purple, not the Svelte default', async ({
	page,
	request
}) => {
	await page.goto('/');
	const href = await page.locator('link[rel="icon"]').getAttribute('href');
	expect(href).toBeTruthy();
	// Vite may inline a small SVG as a data: URL and rewrite its quotes. The
	// page's CSP lets it fetch only its own origin (connect-src 'self'), so read
	// the icon here and parse it in the page.
	const url = href ?? '';
	const data = /^data:([^,]*),(.*)$/s.exec(url);
	const { type, text } = data
		? { type: data[1], text: decodeURIComponent(data[2]) }
		: await request
				.get(url)
				.then(async (r) => ({ type: r.headers()['content-type'], text: await r.text() }));
	const icon = await page.evaluate(
		({ type, text }) => {
			const svg = new DOMParser().parseFromString(text, 'image/svg+xml');
			return {
				type,
				backing: svg.querySelector('svg > rect')?.getAttribute('fill'),
				paths: [...svg.querySelectorAll('path')].map((path) => ({
					fill: path.getAttribute('fill'),
					stroke: path.getAttribute('stroke')
				}))
			};
		},
		{ type, text }
	);
	expect(icon.type).toContain('image/svg+xml');
	// The deep-purple backing square, a dark outline under the N, then the
	// lavender N on top.
	expect(icon.backing).toBe('#6B3FB8');
	expect(icon.paths).toEqual([
		{ fill: '#14161C', stroke: '#14161C' },
		{ fill: '#C4A2F2', stroke: null }
	]);
});

test('an unknown page shows the not-found state, with the footer', async ({ page }) => {
	const response = await page.goto('/no-such-page');
	expect(response?.status()).toBe(404);
	await expect(page.getByRole('heading', { level: 1 })).toHaveText('Not found');
	await expect(page.locator('footer')).toContainText(LEGAL);
});

test('the document is marked once hydrated', async ({ page }) => {
	await page.goto('/');
	await expect(page.locator('html')).toHaveAttribute('data-hydrated', '');
});

test.describe('without JavaScript', () => {
	test.use({ javaScriptEnabled: false });

	test('the layout still renders', async ({ page }) => {
		await page.goto('/');
		await expect(page.getByRole('banner').getByRole('search')).toBeVisible();
		await expect(page.locator('footer')).toContainText(LEGAL);
		await expect(page.locator('html')).not.toHaveAttribute('data-hydrated');
	});
});
