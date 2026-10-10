import { expect, test } from '@playwright/test';

const LEGAL = "ninjagoldfinch.lol isn't endorsed by Riot Games";
const AHRI = '/champions/ahri';

test.describe('without JavaScript', () => {
	test.use({ javaScriptEnabled: false });

	test('a champion page shows the summed rates, set builds, matchups and tiers', async ({
		page
	}) => {
		await page.goto(AHRI);
		await expect(page.getByRole('heading', { level: 1 })).toHaveText('Ahri');
		await expect(page.getByRole('main')).toContainText('every region and tier · All patches');

		// riot-proxy's summed row: winRate 0.5048, pickRate 0.1138, banRate 0.0447, 2407 games.
		const rates = page.locator('dl[aria-label="Rates"]');
		await expect(rates).toContainText('Win rate 50.5%');
		await expect(rates).toContainText('Pick rate 11.4%');
		await expect(rates).toContainText('Ban rate 4.5%');
		await expect(rates).toContainText('Games 2,407');

		const builds = page.getByRole('region', { name: 'Builds' });
		await expect(builds).toContainText('Mid · 1,994 games with a build');
		const tabs = builds.getByRole('navigation', { name: 'Builds' }).getByRole('link');
		await expect(tabs).toHaveCount(3);
		await expect(tabs.first()).toHaveAttribute('aria-current', 'page');
		await expect(tabs.first()).toContainText('49.3%');
		await expect(tabs.first()).toContainText('550 games');

		const summary = builds.getByRole('group', { name: 'Build summary' });
		await expect(summary.getByRole('img', { name: 'Electrocute' })).toBeVisible();
		await expect(summary.getByRole('img', { name: 'Flash' })).toBeVisible();
		await expect(summary.getByRole('img', { name: 'Teleport' })).toBeVisible();
		await expect(summary).toContainText('Q › W › E');
		await expect(summary.getByRole('img', { name: "Doran's Ring" })).toBeVisible();
		await expect(summary.getByRole('img', { name: '2 × Health Potion' })).toBeVisible();

		const path = builds.getByRole('list', { name: 'Item path' });
		await expect(path.getByRole('img', { name: 'Malignance' })).toBeVisible();
		await expect(path.getByRole('img', { name: 'Shadowflame' })).toBeVisible();
		await expect(
			path.getByRole('list', { name: 'Item 3 options' }).getByRole('listitem')
		).toHaveCount(3);

		// Without a role, the matchups follow the builds' role.
		const matchups = page.getByRole('region', { name: /^Matchups/ });
		await expect(matchups.getByRole('heading')).toHaveText('Matchups · Mid');
		await expect(matchups.locator('tbody tr')).toHaveCount(116);
		await expect(matchups.locator('tbody tr').first()).toContainText('Sylas47.6%126');

		const tiers = page.getByRole('region', { name: 'By tier' }).locator('tbody tr');
		await expect(tiers).toHaveCount(5);
		await expect(tiers.first().getByRole('rowheader')).toHaveText('Challenger');
		await expect(tiers.last().getByRole('rowheader')).toHaveText('Unplaced');
		await expect(page.locator('footer')).toContainText(LEGAL);
	});

	test('a build tab opens that build', async ({ page }) => {
		await page.goto(AHRI);
		const builds = page.getByRole('region', { name: 'Builds' });
		await builds.getByRole('navigation', { name: 'Builds' }).getByRole('link').nth(1).click();
		await expect(page).toHaveURL(`${AHRI}?build=2#builds`);
		const tabs = builds.getByRole('navigation', { name: 'Builds' }).getByRole('link');
		await expect(tabs.nth(1)).toHaveAttribute('aria-current', 'page');
		const path = builds.getByRole('list', { name: 'Item path' });
		await expect(path.getByRole('img', { name: 'Lich Bane' })).toBeVisible();
	});

	test('a role tab asks riot-proxy for that role', async ({ page }) => {
		await page.goto(AHRI);
		await page.getByRole('navigation', { name: 'Role' }).getByRole('link', { name: 'Mid' }).click();
		await expect(page).toHaveURL(`${AHRI}?role=mid`);
		await expect(page.getByRole('main')).toContainText('All patches · Mid');
		await expect(page.getByRole('region', { name: /^Matchups/ }).locator('tbody tr')).toHaveCount(
			116
		);
	});

	test("with no set builds, the detail's lists; failed matchups break only their card", async ({
		page
	}) => {
		await page.goto(`${AHRI}?role=bot`);
		const builds = page.getByRole('region', { name: 'Builds' });
		await expect(builds).toContainText('No full builds recorded yet.');
		await expect(
			builds.getByRole('list', { name: 'Most played items' }).getByRole('listitem')
		).toHaveCount(10);
		await expect(builds.getByRole('list', { name: 'Most played runes' })).toBeVisible();
		await expect(builds.getByRole('list', { name: 'Most played spells' })).toBeVisible();
		await expect(page.getByRole('region', { name: /^Matchups/ })).toContainText(
			'Matchups are unavailable right now.'
		);
		await expect(page.getByRole('region', { name: 'By tier' }).locator('tbody tr')).toHaveCount(5);
	});

	test('the table links to a champion page, keeping the role and patch', async ({ page }) => {
		await page.goto('/champions');
		await page.getByRole('link', { name: 'Ahri', exact: true }).click();
		await expect(page).toHaveURL(AHRI);
		await page.getByRole('link', { name: '‹ All champions' }).click();
		await expect(page).toHaveURL('/champions');
	});

	test('a champion is found by name or id in any case, at one URL', async ({ page }) => {
		await page.goto('/champions/AHRI?role=&patch=all');
		await expect(page).toHaveURL(AHRI);
	});
});

test('an unknown champion is not found', async ({ page }) => {
	const response = await page.goto('/champions/nobody');
	expect(response?.status()).toBe(404);
});

test('the edge may cache a champion page for 10 minutes', async ({ request }) => {
	const response = await request.get(AHRI);
	expect(response.headers()['cache-control']).toBe(
		'public, s-maxage=600, stale-while-revalidate=600'
	);
});

test('with JavaScript, a build tab asks the server for nothing', async ({ page }) => {
	await page.goto(AHRI);
	const loads: string[] = [];
	page.on('request', (r) => {
		if (r.url().includes('__data.json')) loads.push(r.url());
	});
	const tabs = page.getByRole('navigation', { name: 'Builds' }).getByRole('link');
	await tabs.nth(2).click();
	await expect(page).toHaveURL(`${AHRI}?build=3#builds`);
	await expect(tabs.nth(2)).toHaveAttribute('aria-current', 'page');
	await expect(
		page.getByRole('list', { name: 'Item path' }).getByRole('img', { name: 'Blackfire Torch' })
	).toBeVisible();
	expect(loads).toEqual([]);
});
