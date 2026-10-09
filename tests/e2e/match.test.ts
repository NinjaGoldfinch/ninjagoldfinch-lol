import { expect, test } from '@playwright/test';

const LEGAL = "ninjagoldfinch.lol isn't endorsed by Riot Games";
const MATCH = '/match/oce/OC1_712351051';

test.describe('without JavaScript', () => {
	test.use({ javaScriptEnabled: false });

	test('a match page shows both teams from its URL', async ({ page }) => {
		await page.goto(MATCH);

		await expect(page.getByRole('heading', { level: 1 })).toHaveText('Ranked Solo');
		await expect(page.getByRole('main')).toContainText('32:32 · Patch 16.20');
		await expect(page.getByRole('main')).toContainText('UTC · Oceania');

		const blue = page.getByRole('region', { name: 'Defeat · Blue team' });
		const red = page.getByRole('region', { name: 'Victory · Red team' });
		await expect(blue.getByRole('row')).toHaveCount(6);
		await expect(red.getByRole('row')).toHaveCount(6);
		await expect(blue).toContainText('28 / 44 / 18');
		await expect(blue.getByRole('list', { name: 'Objectives' })).toContainText('Towers 5');
		await expect(red.getByRole('list', { name: 'Objectives' })).toContainText('Dragons 4');
		await expect(blue.getByRole('list', { name: 'Bans' }).getByRole('img')).toHaveCount(5);

		const ahri = red.getByRole('row', { name: 'Ahri' });
		await expect(ahri).toContainText('NinjaGoldfinch#OCENZ');
		await expect(ahri).toContainText('Mid');
		await expect(ahri).toContainText('8 / 8 / 10');
		await expect(ahri).toContainText('28,294');
		await expect(ahri).toContainText('12,266');
		await expect(ahri.getByTitle('Champion level 16')).toHaveText('Level 16');
		await expect(ahri.getByRole('img', { name: 'Ahri' })).toHaveAttribute(
			'src',
			'https://ddragon.leagueoflegends.com/cdn/16.20.1/img/champion/Ahri.png'
		);
		await expect(ahri.getByRole('list', { name: 'Items' }).getByRole('img')).toHaveCount(7);
		// The bot laner's boots sit in the role quest slot, after the trinket.
		const ezreal = blue.getByRole('row', { name: 'Ezreal' });
		await expect(
			ezreal.getByRole('list', { name: 'Items' }).getByRole('listitem').last().getByRole('img')
		).toHaveAccessibleName('Ionian Boots of Lucidity');

		await ahri.getByRole('link', { name: 'NinjaGoldfinch#OCENZ' }).click();
		await expect(page).toHaveURL('/summoner/oce/NinjaGoldfinch-OCENZ');
	});

	test('a profile row links to its match page', async ({ page }) => {
		await page.goto('/summoner/oce/NinjaGoldfinch-OCENZ');
		const first = page.getByRole('article', { name: 'Victory as Ahri' }).first();
		await first.getByRole('link', { name: 'Details of this match' }).click();

		await expect(page).toHaveURL(MATCH);
		await expect(page.getByRole('region', { name: 'Victory · Red team' })).toBeVisible();
		await expect(page.locator('footer')).toContainText(LEGAL);
	});
});

test('a match page is cacheable at the edge for a day', async ({ request }) => {
	const response = await request.get(MATCH);
	expect(response.status()).toBe(200);
	expect(response.headers()['cache-control']).toBe(
		'public, s-maxage=86400, stale-while-revalidate=86400'
	);
});

test('with JavaScript, a profile row opens its match page', async ({ page }) => {
	await page.goto('/summoner/oce/NinjaGoldfinch-OCENZ');
	await page.getByRole('link', { name: 'Details of this match' }).first().click();
	await expect(page).toHaveURL(MATCH);
	await expect(page.getByRole('heading', { level: 1 })).toHaveText('Ranked Solo');
	await expect(page.getByRole('banner').getByRole('combobox', { name: 'Region' })).toHaveValue(
		'oce'
	);
});

test('an unknown match shows not found', async ({ page }) => {
	const response = await page.goto('/match/oce/OC1_100000');
	expect(response?.status()).toBe(404);
	await expect(page.getByRole('heading', { level: 1 })).toHaveText('Not found');
});

test("a match id from another region's platform shows not found", async ({ page }) => {
	for (const path of ['/match/euw/OC1_712351051', '/match/oce/nonsense', '/match/mars/OC1_1']) {
		const response = await page.goto(path);
		expect(response?.status(), path).toBe(404);
	}
});
