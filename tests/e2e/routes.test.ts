import { expect, test, type Page } from '@playwright/test';

const LEGAL = "ninjagoldfinch.lol isn't endorsed by Riot Games";

async function search(page: Page, region: string, riotId: string) {
	const form = page.getByRole('banner').getByRole('search');
	await form.getByRole('combobox', { name: 'Region' }).selectOption(region);
	await form.getByRole('textbox', { name: 'Riot ID' }).fill(riotId);
	await form.getByRole('button', { name: 'Search' }).click();
}

test.describe('without JavaScript', () => {
	test.use({ javaScriptEnabled: false });

	test('searching a Riot ID opens its profile', async ({ page }) => {
		await page.goto('/');
		await search(page, 'oce', 'NinjaGoldfinch#OCENZ');

		await expect(page).toHaveURL('/summoner/oce/NinjaGoldfinch-OCENZ');
		await expect(page.getByRole('heading', { level: 1 })).toHaveText('NinjaGoldfinch#OCENZ');
		await expect(page.getByRole('main')).toContainText('Oceania · Level 458');
		await expect(page.locator('footer')).toContainText(LEGAL);
	});

	test('a profile shows rank and the first page of matches', async ({ page }) => {
		await page.goto('/summoner/oce/NinjaGoldfinch-OCENZ');

		await expect(page.getByRole('region', { name: 'Rank' })).toContainText('EMERALD III, 67 LP');
		const matches = page.getByRole('region', { name: 'Recent matches' }).getByRole('listitem');
		await expect(matches).toHaveCount(10);
		await expect(matches.first()).toContainText('win · Ahri · 8/8/10');
	});

	test('a Riot ID without a tag asks for one', async ({ page }) => {
		await page.goto('/');
		await search(page, 'oce', 'NinjaGoldfinch');

		await expect(page).toHaveURL(/\/search\?/);
		await expect(page.getByRole('heading', { level: 1 })).toHaveText('Search for a player');
		await expect(page.getByRole('main').getByRole('textbox')).toHaveValue('NinjaGoldfinch');
	});
});

test('a profile is cacheable at the edge', async ({ request }) => {
	const response = await request.get('/summoner/oce/NinjaGoldfinch-OCENZ');
	expect(response.status()).toBe(200);
	expect(response.headers()['cache-control']).toBe(
		'public, s-maxage=60, stale-while-revalidate=300'
	);
});

test('an unknown player shows not found', async ({ page }) => {
	const response = await page.goto('/summoner/oce/NoSuchPlayer000-XXXX');
	expect(response?.status()).toBe(404);
	await expect(page.getByRole('heading', { level: 1 })).toHaveText('Not found');
});

test('an unknown region shows not found', async ({ page }) => {
	const response = await page.goto('/summoner/mars/NinjaGoldfinch-OCENZ');
	expect(response?.status()).toBe(404);
});

test('opened profiles appear under recent searches', async ({ page }) => {
	await page.goto('/summoner/oce/NinjaGoldfinch-OCENZ');
	await expect(page.getByRole('heading', { level: 1 })).toHaveText('NinjaGoldfinch#OCENZ');
	await page.goto('/');

	const recent = page.getByRole('region', { name: 'Recent searches' });
	await expect(recent.getByRole('link', { name: /NinjaGoldfinch#OCENZ/ })).toHaveAttribute(
		'href',
		'/summoner/oce/NinjaGoldfinch-OCENZ'
	);
});

test('/about shows what the site is and the legal notice', async ({ page }) => {
	await page.goto('/about');
	await expect(page.getByRole('heading', { level: 1 })).toHaveText('About ninjagoldfinch.lol');
	await expect(page.getByRole('main')).toContainText(LEGAL);
});

test('/healthz answers without touching the proxy', async ({ request }) => {
	const response = await request.get('/healthz');
	expect(response.status()).toBe(200);
	expect(await response.json()).toEqual({ ok: true });
	expect(response.headers()['cache-control']).toBe('no-store');
});
