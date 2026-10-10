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
