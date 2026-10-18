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
		// Only Sylas has 100 games or more in Mid.
		await expect(matchups.locator('tbody tr').filter({ hasText: 'Low sample' })).toHaveCount(115);
		// The summed row and the three builds clear 100 games; later item options may not.
		await expect(page.locator('dl[aria-label="Rates"]')).not.toContainText('Low sample');
		await expect(tabs.filter({ hasText: 'Low sample' })).toHaveCount(0);
		await expect(path.getByRole('list', { name: 'Item 5 options' })).toContainText('Low sample');

		const tiers = page.getByRole('region', { name: 'By tier' }).locator('tbody tr');
		await expect(tiers).toHaveCount(6);
		// Challenger 38, Grandmaster 43, Emerald 13 and Platinum 1 game are low samples.
		await expect(tiers.filter({ hasText: 'Low sample' })).toHaveCount(4);
		await expect(tiers.filter({ hasText: 'Master' }).last()).not.toContainText('Low sample');
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
		await expect(page.getByRole('region', { name: 'By tier' }).locator('tbody tr')).toHaveCount(6);
	});

	test('the table links to a champion page, keeping the role and patch', async ({ page }) => {
		await page.goto('/champions');
		await page.getByRole('link', { name: 'Ahri', exact: true }).click();
		await expect(page).toHaveURL(AHRI);
		await page.getByRole('link', { name: '‹ All champions' }).click();
		await expect(page).toHaveURL('/champions');
	});

	test('a tier and above: the summed rates and only its tiers', async ({ page }) => {
		await page.goto(`${AHRI}?rank=emerald+`);
		await expect(page.getByRole('main')).toContainText(
			'Ranked Solo/Duo · every region · Emerald+ · All patches'
		);
		await expect(page.getByRole('combobox', { name: 'Tier' })).toHaveValue('emerald+');
		// Synthetic minTier=EMERALD detail: 816 games over Emerald to Challenger, 432 wins.
		const rates = page.locator('dl[aria-label="Rates"]');
		await expect(rates).toContainText('Games 816');
		await expect(rates).toContainText('Win rate 52.9%');
		const tiers = page.getByRole('region', { name: 'By tier · Emerald+' }).locator('tbody tr');
		await expect(tiers.getByRole('rowheader')).toHaveText([
			'Challenger',
			'Grandmaster',
			'Master',
			'Emerald'
		]);
		await expect(page.getByRole('main')).toContainText('Each rate counts Emerald+ unless');
		await expect(
			page.getByRole('navigation', { name: 'Role' }).getByRole('link', { name: 'Mid' })
		).toHaveAttribute('href', `${AHRI}?role=mid&rank=emerald+`);
	});

	test("one tier: that tier's rates and its row", async ({ page }) => {
		await page.goto(AHRI);
		await page.getByRole('combobox', { name: 'Tier' }).selectOption({ label: 'Master' });
		await page
			.getByRole('form', { name: 'Patch and tier' })
			.getByRole('button', { name: 'Apply' })
			.click();
		await expect(page).toHaveURL(`${AHRI}?rank=master`);
		await expect(page.getByRole('main')).toContainText('every region · Master · All patches');
		// riot-proxy labels the summed row MASTER under tier=MASTER; it is still the header's.
		const rates = page.locator('dl[aria-label="Rates"]');
		await expect(rates).toContainText('Games 722');
		await expect(rates).toContainText('Win rate 52.8%');
		const tiers = page.getByRole('region', { name: 'By tier · Master' }).locator('tbody tr');
		await expect(tiers.getByRole('rowheader')).toHaveText(['Master']);
	});

	test('a matchup links to the builds against that opponent in that lane', async ({ page }) => {
		await page.goto(AHRI);
		const syndra = page
			.getByRole('region', { name: /^Matchups/ })
			.locator('tbody tr')
			.filter({ hasText: 'Syndra' });
		await syndra.getByRole('link', { name: /%$/ }).click();
		await expect(page).toHaveURL(`${AHRI}?vs=syndra&lane=mid#builds`);

		const builds = page.getByRole('region', { name: 'Builds' });
		await expect(builds).toContainText('Mid · 71 games with a build against Syndra');
		await expect(builds.getByRole('combobox', { name: 'Against' })).toHaveValue('syndra');
		const tabs = builds.getByRole('navigation', { name: 'Builds' }).getByRole('link');
		await expect(tabs).toHaveCount(3);
		await expect(tabs.nth(1)).toHaveAttribute('href', `${AHRI}?vs=syndra&lane=mid&build=2#builds`);
		// riot-proxy sends no skill order, starter, 4th or 5th item against an opponent.
		const summary = builds.getByRole('group', { name: 'Build summary' });
		await expect(summary).not.toContainText('Skills');
		await expect(summary).not.toContainText('Starter');
		await expect(summary).toContainText('Boots');
		const path = builds.getByRole('list', { name: 'Item path' });
		await expect(path.getByRole('list', { name: 'Item 3 options' })).toBeVisible();
		await expect(path.getByRole('list', { name: 'Item 4 options' })).toHaveCount(0);
		await expect(path).not.toContainText('–');
		// The rest of the page is not against anyone.
		await expect(page.locator('dl[aria-label="Rates"]')).toContainText('Games 2,407');
		// A role tab keeps the opponent; the role is now the lane.
		await expect(
			page.getByRole('navigation', { name: 'Role' }).getByRole('link', { name: 'Mid' })
		).toHaveAttribute('href', `${AHRI}?role=mid&vs=syndra`);
	});

	test('the vs picker asks for the builds against one opponent, and back', async ({ page }) => {
		await page.goto(AHRI);
		const picker = page.getByRole('form', { name: 'Builds against an opponent' });
		const against = picker.getByRole('combobox', { name: 'Against' });
		await expect(against).toHaveValue('');
		// Each opponent once, games summed over lanes: Sylas 126 + 2 + 1.
		await expect(against.locator('option').nth(1)).toHaveText('vs Sylas · 129');
		await against.selectOption({ label: 'vs Syndra · 94' });
		await picker.getByRole('button', { name: 'Apply' }).click();
		await expect(page).toHaveURL(`${AHRI}?vs=syndra#builds`);
		await expect(page.getByRole('region', { name: 'Builds' })).toContainText('against Syndra');

		await page
			.getByRole('form', { name: 'Builds against an opponent' })
			.getByRole('combobox', { name: 'Against' })
			.selectOption({ label: 'vs any opponent' });
		await page
			.getByRole('form', { name: 'Builds against an opponent' })
			.getByRole('button', { name: 'Apply' })
			.click();
		await expect(page).toHaveURL(new RegExp(`${AHRI}(#builds)?$`));
		await expect(page.getByRole('region', { name: 'Builds' })).toContainText(
			'Mid · 1,994 games with a build'
		);
	});

	test('an opponent never met: no builds, no fallback, the picker kept', async ({ page }) => {
		await page.goto(`${AHRI}?vs=yuumi`);
		const builds = page.getByRole('region', { name: 'Builds' });
		await expect(builds).toContainText('No builds against Yuumi in this slice yet.');
		await expect(builds.getByRole('list', { name: 'Most played items' })).toHaveCount(0);
		const against = builds.getByRole('combobox', { name: 'Against' });
		await expect(against).toHaveValue('yuumi');
		// Not in the matchups: last, without a count.
		await expect(against.locator('option').last()).toHaveText('vs Yuumi');
	});

	test("a failed call against an opponent says so, without the detail's lists", async ({
		page
	}) => {
		await page.goto(`${AHRI}?vs=mel`);
		const builds = page.getByRole('region', { name: 'Builds' });
		await expect(builds).toContainText('Builds against Mel are unavailable right now.');
		await expect(builds.getByRole('list', { name: 'Most played items' })).toHaveCount(0);
		await expect(builds.getByRole('combobox', { name: 'Against' })).toHaveValue('mel');
	});

	test('an unknown opponent or lane is dropped; a role drops the lane', async ({ page }) => {
		await page.goto(`${AHRI}?vs=nobody`);
		await expect(page).toHaveURL(AHRI);
		await page.goto(`${AHRI}?vs=syndra&lane=middle`);
		await expect(page).toHaveURL(`${AHRI}?vs=syndra`);
		await page.goto(`${AHRI}?lane=mid&vs=syndra&role=mid`);
		await expect(page).toHaveURL(`${AHRI}?role=mid&vs=syndra`);
		await expect(page.getByRole('region', { name: 'Builds' })).toContainText(
			'Mid · 71 games with a build against Syndra'
		);
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
