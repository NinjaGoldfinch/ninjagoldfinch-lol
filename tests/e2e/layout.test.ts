import { expect, test } from '@playwright/test';

const LEGAL = "ninjagoldfinch.lol isn't endorsed by Riot Games";

test('every page has the search form and the Riot legal notice', async ({ page }) => {
	await page.goto('/');
	const search = page.getByRole('banner').getByRole('search');
	// A Riot ID names its own region (ADR-037), so there is nothing to pick.
	await expect(search.getByRole('combobox', { name: 'Region' })).toHaveCount(0);
	await expect(search.getByRole('textbox', { name: 'Riot ID or champion' })).toBeVisible();
	await expect(page.locator('footer')).toContainText(LEGAL);
});

test('the accent is light purple', async ({ page }) => {
	await page.goto('/');
	const name = page.getByRole('banner').getByRole('link', { name: 'ninjagoldfinch.lol' });
	const button = page.getByRole('banner').getByRole('button', { name: 'Search' });
	await expect(name).toHaveCSS('color', 'oklch(0.79 0.12 302)');
	await expect(button).toHaveCSS('background-color', 'oklch(0.79 0.12 302)');
});

test('the site icon is the purple ninja, not the Svelte default', async ({ page }) => {
	await page.goto('/');
	const href = await page.locator('link[rel="icon"]').getAttribute('href');
	expect(href).toBeTruthy();
	// Vite may inline a small SVG as a data: URL and rewrite its quotes, so
	// fetch it from the page and read the parsed document.
	const icon = await page.evaluate(async (url) => {
		const response = await fetch(url);
		const svg = new DOMParser().parseFromString(await response.text(), 'image/svg+xml');
		return {
			type: response.headers.get('content-type'),
			backing: svg.querySelector('svg > rect')?.getAttribute('fill'),
			fills: [...svg.querySelectorAll('path')].map((path) => path.getAttribute('fill'))
		};
	}, href ?? '');
	expect(icon.type).toContain('image/svg+xml');
	// The deep-purple backing square, the black hood and the lavender eye band.
	expect(icon.backing).toBe('#6B3FB8');
	expect(icon.fills).toEqual(expect.arrayContaining(['#14161C', '#C4A2F2']));
});

test('an unknown page shows the not-found state, with the footer', async ({ page }) => {
	const response = await page.goto('/no-such-page');
	expect(response?.status()).toBe(404);
	await expect(page.getByRole('heading', { level: 1 })).toHaveText('Not found');
	await expect(page.locator('footer')).toContainText(LEGAL);
});

test.describe('without JavaScript', () => {
	test.use({ javaScriptEnabled: false });

	test('the layout still renders', async ({ page }) => {
		await page.goto('/');
		await expect(page.getByRole('banner').getByRole('search')).toBeVisible();
		await expect(page.locator('footer')).toContainText(LEGAL);
	});
});
