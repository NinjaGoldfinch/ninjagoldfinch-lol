import { expect, test } from '@playwright/test';

const LEGAL = "ninjagoldfinch.lol isn't endorsed by Riot Games";

test('every page has the search form and the Riot legal notice', async ({ page }) => {
	await page.goto('/');
	const search = page.getByRole('banner').getByRole('search');
	await expect(search.getByRole('combobox', { name: 'Region' })).toHaveValue('oce');
	await expect(search.getByRole('textbox', { name: 'Riot ID' })).toBeVisible();
	await expect(page.locator('footer')).toContainText(LEGAL);
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
