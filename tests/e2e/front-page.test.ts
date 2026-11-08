import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';

const LEGAL = "ninjagoldfinch.lol isn't endorsed by Riot Games";

type Row = { championName: string; games: number; winRate: number; tier: string | null };
/** The recorded rows for all patches, as the mock proxy serves them to the front page. */
const recorded = (
	JSON.parse(
		readFileSync(join(import.meta.dirname, '../fixtures/analytics-champions-all.json'), 'utf8')
	) as { response: { body: { champions: Row[] } } }
).response.body.champions;
/** The six highest win rates over 800 games, highest first, ties to more games. */
const top = recorded
	.filter((r) => r.tier === null && r.games >= 800)
	.toSorted((a, b) => b.winRate - a.winRate || b.games - a.games)
	.slice(0, 6);

test.describe('without JavaScript', () => {
	test.use({ javaScriptEnabled: false });

	test('the front page shows the hero, the pills and the top win rates', async ({ page }) => {
		await page.goto('/');
		const main = page.getByRole('main');

		await expect(page.getByRole('heading', { level: 1 })).toHaveText('Look up any League player');
		await expect(main.getByText('Patch 16.20', { exact: true })).toBeVisible();
		await expect(main.getByText('211,590 ranked games analysed')).toBeVisible();
		await expect(
			main.getByRole('search').getByRole('combobox', { name: 'Riot ID or champion' })
		).toBeVisible();

		await expect(main).toContainText('Try Ahri, Jinx or NinjaGoldfinch#OCENZ');
		for (const [name, href] of [
			['Ahri', '/champions/ahri'],
			['Jinx', '/champions/jinx'],
			['NinjaGoldfinch#OCENZ', '/summoner/NinjaGoldfinch-OCENZ']
		]) {
			await expect(main.getByRole('link', { name, exact: true })).toHaveAttribute('href', href);
		}

		const card = page.getByRole('region', { name: 'Top win rate · Ranked Solo' });
		await expect(card).toContainText('min. 800 games');
		const rows = card.getByRole('listitem');
		await expect(rows).toHaveCount(6);
		for (const [i, row] of top.entries()) {
			await expect(rows.nth(i)).toContainText(row.championName);
		}
		await expect(rows.first()).toContainText('Taliyah');
		await expect(rows.first()).toContainText('54.8%');
		await expect(rows.first().getByRole('img', { name: 'Taliyah' })).toHaveAttribute(
			'src',
			'https://ddragon.leagueoflegends.com/cdn/16.20.1/img/champion/Taliyah.png'
		);
		await expect(rows.first().getByRole('link', { name: 'Taliyah' })).toHaveAttribute(
			'href',
			'/champions/taliyah'
		);
		await expect(card.getByRole('link', { name: 'All champions' })).toHaveAttribute(
			'href',
			'/champions?sort=win'
		);
		await expect(page.locator('footer')).toContainText(LEGAL);
	});

	test('the hero search opens a profile', async ({ page }) => {
		await page.goto('/');
		const form = page.getByRole('main').getByRole('search');
		await form.getByRole('combobox', { name: 'Riot ID or champion' }).fill('NinjaGoldfinch#OCENZ');
		await form.getByRole('button', { name: 'Search' }).click();

		await expect(page).toHaveURL('/summoner/NinjaGoldfinch-OCENZ');
		await expect(page.getByRole('heading', { level: 1 })).toHaveText('NinjaGoldfinch#OCENZ');
	});
});

test('the edge keeps the front page for a minute', async ({ request }) => {
	const response = await request.get('/');
	expect(response.status()).toBe(200);
	expect(response.headers()['cache-control']).toBe(
		'public, s-maxage=60, stale-while-revalidate=120'
	);
});
