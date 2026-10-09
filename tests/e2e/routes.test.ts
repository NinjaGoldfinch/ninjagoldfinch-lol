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

	test('a profile shows its header, rank and the first page of matches', async ({ page }) => {
		await page.goto('/summoner/oce/NinjaGoldfinch-OCENZ');

		const main = page.getByRole('main');
		await expect(main.locator('img').first()).toHaveAttribute(
			'src',
			'https://ddragon.leagueoflegends.com/cdn/16.20.1/img/profileicon/7173.png'
		);
		await expect(main).toContainText('Updated 3 minutes ago');
		const rank = page.getByRole('region', { name: 'Rank' });
		await expect(rank).toContainText('Ranked Solo/Duo');
		await expect(rank).toContainText('Emerald III 67 LP');
		await expect(rank).toContainText('475W 464L · 51%');
		const matches = page.getByRole('region', { name: 'Recent matches' }).getByRole('article');
		await expect(matches).toHaveCount(10);

		const first = page.getByRole('article', { name: 'Victory as Ahri' }).first();
		await expect(first).toContainText('Ranked Solo');
		await expect(first).toContainText('32:32');
		await expect(first).toContainText('8 / 8 / 10');
		await expect(first).toContainText('2.25 KDA');
		await expect(first).toContainText('181 CS (5.6/min)');
		await expect(first.getByRole('img', { name: 'Ahri' })).toHaveAttribute(
			'src',
			'https://ddragon.leagueoflegends.com/cdn/16.20.1/img/champion/Ahri.png'
		);
		await expect(first.getByRole('img', { name: 'Flash' })).toBeVisible();
		await expect(first.getByRole('list', { name: 'Items' }).getByRole('img')).toHaveCount(7);
		await expect(first.getByRole('img', { name: "Doran's Ring" })).toBeVisible();
	});

	test('refresh re-reads the profile and starts the cooldown', async ({ page }) => {
		await page.goto('/summoner/oce/NinjaGoldfinch-OCENZ');
		await page.getByRole('button', { name: 'Refresh' }).click();

		await expect(page.getByRole('heading', { level: 1 })).toHaveText('NinjaGoldfinch#OCENZ');
		await expect(page.getByRole('button', { name: 'Refresh' })).toBeDisabled();
		await expect(page.getByRole('main')).toContainText('Refresh available in 60s');
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

test('with JavaScript, refresh counts the cooldown down', async ({ page }) => {
	await page.goto('/summoner/oce/NinjaGoldfinch-OCENZ');
	const button = page.getByRole('button', { name: 'Refresh' });
	await expect(button).toBeEnabled();
	await button.click();

	await expect(button).toBeDisabled();
	await expect(page.getByRole('main')).toContainText(/Refresh available in (59|60)s/);
	await expect(page.getByRole('main')).toContainText(/Refresh available in 5[0-8]s/, {
		timeout: 4000
	});
});

test("the header search starts at the profile's region", async ({ page }) => {
	// No fixture exists for this player, so the page fails; the header still follows the URL.
	await page.goto('/summoner/kr/Somebody-KR1');
	await expect(page.getByRole('banner').getByRole('combobox', { name: 'Region' })).toHaveValue(
		'kr'
	);
});
