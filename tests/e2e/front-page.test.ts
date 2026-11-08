import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';
import { hydrated } from './hydrated.ts';

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

		// The rotation links champions too, so the examples are found in their line.
		const examples = main.locator('p', { hasText: /^Try / });
		await expect(examples).toHaveText('Try Ahri, Jinx or NinjaGoldfinch#OCENZ');
		for (const [name, href] of [
			['Ahri', '/champions/ahri'],
			['Jinx', '/champions/jinx'],
			['NinjaGoldfinch#OCENZ', '/summoner/NinjaGoldfinch-OCENZ']
		]) {
			await expect(examples.getByRole('link', { name, exact: true })).toHaveAttribute('href', href);
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

	test("Oceania's free rotation and server status are on the page by default", async ({ page }) => {
		await page.goto('/');

		const rotation = page.getByRole('region', { name: 'Free this week' });
		const icons = rotation.getByRole('list', { name: 'Free champions' }).getByRole('link');
		await expect(icons).toHaveCount(16);
		await expect(icons.first()).toHaveAttribute('href', '/champions/ahri');
		await expect(icons.first().getByRole('img')).toHaveAttribute(
			'src',
			'https://ddragon.leagueoflegends.com/cdn/16.20.1/img/champion/Ahri.png'
		);
		await expect(rotation).toContainText('16 champions free to play on Oceania.');
		await expect(rotation.getByRole('combobox', { name: 'Region' })).toHaveValue('oce');

		const status = page.getByRole('region', { name: 'Server status' });
		await expect(status).toContainText('All services running');
		await expect(status).toContainText(
			"From Riot's status feed for Oceania · checked 3 minutes ago"
		);
	});

	test('the region picker applies with its button', async ({ page }) => {
		await page.goto('/');
		const picker = page.getByRole('form', { name: 'Region' }).first();
		await picker.getByRole('combobox', { name: 'Region' }).selectOption({ label: 'Korea' });
		await picker.getByRole('button', { name: 'Apply' }).click();
		await expect(page).toHaveURL('/?region=kr');

		const rotation = page.getByRole('region', { name: 'Free this week' });
		await expect(
			rotation.getByRole('list', { name: 'Free champions' }).getByRole('link')
		).toHaveCount(8);
		await expect(rotation).toContainText('8 champions free to play on Korea.');

		const status = page.getByRole('region', { name: 'Server status' });
		const open = status.getByRole('list', { name: 'Open incidents and maintenances' });
		await expect(open.getByRole('listitem')).toHaveCount(2);
		await expect(open.getByRole('listitem').first()).toContainText('Ranked queues are disabled');
		await expect(open.getByRole('listitem').first()).toContainText('Incident · warning');
		await expect(open.getByRole('listitem').nth(1)).toContainText(
			'Scheduled maintenance for patch 16.21'
		);
		await expect(open.getByRole('listitem').nth(1)).toContainText('Maintenance · scheduled');
		await expect(status).not.toContainText('All services running');
		await expect(status).not.toContainText('Store maintenance');
		await expect(status.getByRole('combobox', { name: 'Region' })).toHaveValue('kr');
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

test('a region named any other way redirects to the canonical URL, uncached', async ({
	request
}) => {
	for (const path of ['/?region=mars', '/?region=OCE', '/?region=oce&junk=1', '/?region=oce']) {
		const response = await request.get(path, { maxRedirects: 0 });
		expect(response.status(), path).toBe(307);
		expect(response.headers()['location'], path).toBe('/');
		expect(response.headers()['cache-control'], path).toBe('no-store');
	}
	const korea = await request.get('/?region=KR', { maxRedirects: 0 });
	expect(korea.status()).toBe(307);
	expect(korea.headers()['location']).toBe('/?region=kr');
});

test("the edge keeps another region's front page for a minute", async ({ request }) => {
	const response = await request.get('/?region=kr');
	expect(response.status()).toBe(200);
	expect(response.headers()['cache-control']).toBe(
		'public, s-maxage=60, stale-while-revalidate=120'
	);
});

test('with JavaScript, choosing a region applies it at once', async ({ page }) => {
	await page.goto('/');
	await hydrated(page);
	await page
		.getByRole('region', { name: 'Server status' })
		.getByRole('combobox', { name: 'Region' })
		.selectOption({ label: 'Korea' });
	await expect(page).toHaveURL('/?region=kr');
	await expect(page.getByRole('region', { name: 'Server status' })).toContainText(
		'Ranked queues are disabled'
	);
	await expect(page.getByRole('button', { name: 'Apply' })).toHaveCount(0);
});
