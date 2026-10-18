import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';

const LEGAL = "ninjagoldfinch.lol isn't endorsed by Riot Games";

type Row = { championName: string; winRate: number; pickRate: number | null };
/** The recorded rows for all patches and every role, as the mock proxy serves them. */
const recorded = (
	JSON.parse(
		readFileSync(join(import.meta.dirname, '../fixtures/analytics-champions-all.json'), 'utf8')
	) as { response: { body: { champions: Row[] } } }
).response.body.champions;
const highest = (rate: (r: Row) => number) => recorded.toSorted((a, b) => rate(b) - rate(a))[0];
const percent = (rate: number) => `${(rate * 100).toFixed(1)}%`;

test.describe('without JavaScript', () => {
	test.use({ javaScriptEnabled: false });

	test('the header links to a table of every champion, by pick rate, on all patches', async ({
		page
	}) => {
		await page.goto('/');
		await page.getByRole('link', { name: 'Champions', exact: true }).click();
		await expect(page).toHaveURL('/champions');

		await expect(page.getByRole('heading', { level: 1 })).toHaveText('Champions');
		await expect(page.getByRole('main')).toContainText('every region and tier · All patches');
		await expect(page.getByRole('combobox', { name: 'Patch' })).toHaveValue('all');
		await expect(page.getByRole('link', { name: 'All roles' })).toHaveAttribute(
			'aria-current',
			'page'
		);

		const rows = page.getByRole('table').locator('tbody tr');
		await expect(rows).toHaveCount(recorded.length);
		const top = highest((r) => r.pickRate ?? -1);
		await expect(rows.first().getByRole('rowheader')).toHaveText(top.championName);
		await expect(rows.first()).toContainText(percent(top.pickRate ?? 0));
		await expect(page.getByRole('columnheader', { name: 'Pick rate' })).toHaveAttribute(
			'aria-sort',
			'descending'
		);
		// Every champion has 100 games or more over all patches: nothing is marked.
		await expect(page.getByRole('table')).not.toContainText('Low sample');
		await expect(page.getByRole('main')).toContainText(
			'Low sample: fewer than 100 games, so its rates can swing widely.'
		);
		await expect(page.locator('footer')).toContainText(LEGAL);
	});

	test('a column header sorts by its rate', async ({ page }) => {
		await page.goto('/champions');
		await page.getByRole('link', { name: 'Win rate' }).click();
		await expect(page).toHaveURL('/champions?sort=win');

		const top = highest((r) => r.winRate);
		const first = page.getByRole('table').locator('tbody tr').first();
		await expect(first.getByRole('rowheader')).toHaveText(top.championName);
		await expect(first).toContainText(percent(top.winRate));
		await expect(page.getByRole('columnheader', { name: /Win rate/ })).toHaveAttribute(
			'aria-sort',
			'descending'
		);
	});

	test('a role tab filters the table and keeps the sort', async ({ page }) => {
		await page.goto('/champions?sort=ban');
		await page.getByRole('link', { name: 'Mid' }).click();
		await expect(page).toHaveURL('/champions?role=mid&sort=ban');
		await expect(page.getByRole('link', { name: 'Mid' })).toHaveAttribute('aria-current', 'page');
		await expect(page.getByRole('table').locator('tbody tr')).toHaveCount(165);
	});

	test('the patch picker shows one patch', async ({ page }) => {
		await page.goto('/champions');
		await page.getByRole('combobox', { name: 'Patch' }).selectOption('16.19');
		await page.getByRole('button', { name: 'Apply' }).click();
		await expect(page).toHaveURL('/champions?patch=16.19');
		await expect(page.getByRole('main')).toContainText('Patch 16.19');
		const rows = page.getByRole('table').locator('tbody tr');
		await expect(rows).toHaveCount(173);
		// Every champion has under 100 games on one patch, so every row is marked.
		await expect(rows.filter({ hasText: 'Low sample' })).toHaveCount(173);
	});

	test('the tier picker shows a tier and above, and the links keep it', async ({ page }) => {
		await page.goto('/champions');
		await expect(page.getByRole('combobox', { name: 'Tier' })).toHaveValue('');
		await page.getByRole('combobox', { name: 'Tier' }).selectOption({ label: 'Emerald+' });
		await page.getByRole('button', { name: 'Apply' }).click();
		// The form sends rank=emerald%2B; the page answers at the URL it writes itself.
		await expect(page).toHaveURL('/champions?rank=emerald+');
		await expect(page.getByRole('combobox', { name: 'Tier' })).toHaveValue('emerald+');
		await expect(page.getByRole('main')).toContainText(
			'Ranked Solo/Duo · every region · Emerald+ · All patches'
		);
		// riot-proxy's minTier=EMERALD table (synthetic: its 40 most played champions).
		await expect(page.getByRole('table').locator('tbody tr')).toHaveCount(40);
		await expect(page.getByRole('link', { name: 'Mid' })).toHaveAttribute(
			'href',
			'/champions?role=mid&rank=emerald+'
		);
		await page.getByRole('link', { name: 'Ahri', exact: true }).click();
		await expect(page).toHaveURL('/champions/ahri?rank=emerald+');
		await page.getByRole('link', { name: '‹ All champions' }).click();
		await expect(page).toHaveURL('/champions?rank=emerald+');
	});

	test('choosing All tiers again drops the rank', async ({ page }) => {
		await page.goto('/champions?rank=emerald+');
		await page.getByRole('combobox', { name: 'Tier' }).selectOption({ label: 'All tiers' });
		await page.getByRole('button', { name: 'Apply' }).click();
		await expect(page).toHaveURL('/champions');
		await expect(page.getByRole('table').locator('tbody tr')).toHaveCount(recorded.length);
	});

	test('a URL with defaults or unknown values redirects to the clean one', async ({ page }) => {
		await page.goto('/champions?role=&patch=all&sort=pick');
		await expect(page).toHaveURL('/champions');
		await page.goto('/champions?role=MIDDLE&sort=games');
		await expect(page).toHaveURL('/champions');
		await page.goto('/champions?rank=mythic');
		await expect(page).toHaveURL('/champions');
		await page.goto('/champions?rank=emerald%2B');
		await expect(page).toHaveURL('/champions?rank=emerald+');
	});
});

test('the edge may cache the table for 10 minutes', async ({ request }) => {
	const response = await request.get('/champions');
	expect(response.headers()['cache-control']).toBe(
		'public, s-maxage=600, stale-while-revalidate=600'
	);
});

test('with JavaScript, sorting asks the server for nothing', async ({ page }) => {
	await page.goto('/champions');
	const loads: string[] = [];
	page.on('request', (r) => {
		if (r.url().includes('__data.json')) loads.push(r.url());
	});
	await page.getByRole('link', { name: 'Ban rate' }).click();
	await expect(page).toHaveURL('/champions?sort=ban');
	await expect(page.getByRole('columnheader', { name: /Ban rate/ })).toHaveAttribute(
		'aria-sort',
		'descending'
	);
	expect(loads).toEqual([]);
});
