import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test, type Page } from '@playwright/test';
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
		await expect(main.getByText('21,159 ranked games analysed')).toBeVisible();
		await expect(
			main.getByRole('search').getByRole('combobox', { name: 'Riot ID or champion' })
		).toBeVisible();

		// The win-rate card links champions too, so the examples are found in their line.
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
		await expect(card).toContainText('All patches · min. 800 games');
		const rows = card.locator('tbody').getByRole('row');
		await expect(rows).toHaveCount(6);
		for (const [i, row] of top.entries()) {
			await expect(rows.nth(i)).toContainText(row.championName);
		}
		await expect(rows.first()).toContainText('Taliyah');
		await expect(rows.first()).toContainText('54.8%');
		// Its pick and ban rates and games beside the win rate.
		await expect(rows.first().getByRole('cell')).toHaveText(['1', '54.8%', /%$/, /%$/, /^[\d,]+$/]);
		await expect(card.getByRole('columnheader', { name: 'Win rate' })).toHaveAttribute(
			'aria-sort',
			'descending'
		);
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

	test("Oceania's server status is on the page by default, and no free rotation", async ({
		page
	}) => {
		await page.goto('/');

		// The free-rotation card is gone (ADR-076).
		await expect(page.getByRole('region', { name: 'Free this week' })).toHaveCount(0);
		await expect(page.getByRole('form', { name: 'Region' })).toHaveCount(1);

		const status = page.getByRole('region', { name: 'Server status' });
		await expect(status.getByRole('combobox', { name: 'Region' })).toHaveValue('oce');
		await expect(status).toContainText('All services running');
		await expect(status).toContainText('No open incidents or maintenance on Oceania.');
		await expect(status).toContainText(
			"From Riot's status feed for Oceania · checked 3 minutes ago"
		);
		await expect(status.getByRole('link', { name: "Riot's status page" })).toHaveAttribute(
			'href',
			'https://status.riotgames.com/lol?region=oc1&locale=en_US'
		);
	});

	test('the region picker applies with its button', async ({ page }) => {
		await page.goto('/');
		const picker = page.getByRole('form', { name: 'Region' });
		await picker.getByRole('combobox', { name: 'Region' }).selectOption({ label: 'Korea' });
		await picker.getByRole('button', { name: 'Apply' }).click();
		await expect(page).toHaveURL('/?region=kr');

		const status = page.getByRole('region', { name: 'Server status' });
		const open = status.getByRole('list', { name: 'Open incidents and maintenances' });
		await expect(open.getByRole('listitem')).toHaveCount(3);
		await expect(open.getByRole('listitem').first()).toContainText('Ranked queues are disabled');
		// Each entry's age is counted from now, so only its form is checked (ADR-075).
		await expect(open.getByRole('listitem').first()).toContainText(
			/Incident · warning · updated \d+ (minute|hour|day)s? ago/
		);
		await expect(open.getByRole('listitem').first()).toContainText(
			'Ranked queues are disabled while we investigate an issue.'
		);
		// The fixture's incident without a title shows under a generic one (ADR-072);
		// never updated, it says when it was opened, and has no update to show.
		await expect(open.getByRole('listitem').nth(1)).toHaveText(
			/^\s*Incident\s*Incident · info · opened \d+ (minute|hour|day)s? ago\s*$/
		);
		await expect(open.getByRole('listitem').nth(2)).toContainText(
			'Scheduled maintenance for patch 16.21'
		);
		await expect(open.getByRole('listitem').nth(2)).toContainText('Maintenance · scheduled');
		await expect(status).toContainText('2 incidents · 1 maintenance');
		await expect(status).not.toContainText('All services running');
		await expect(status.getByRole('link', { name: "Riot's status page" })).toHaveAttribute(
			'href',
			'https://status.riotgames.com/lol?region=kr&locale=en_US'
		);
		await expect(status).not.toContainText('Store maintenance');
		await expect(status.getByRole('combobox', { name: 'Region' })).toHaveValue('kr');
	});

	test("a region whose status is unavailable still links to Riot's status page", async ({
		page
	}) => {
		// No fixture for Japan's status, so the mock answers 500.
		const response = await page.goto('/?region=jp');
		expect(response?.status()).toBe(200);
		expect(response?.headers()['cache-control']).toBe('no-store');

		const status = page.getByRole('region', { name: 'Server status' });
		await expect(status).toContainText('Server status is unavailable right now.');
		await expect(status).not.toContainText("From Riot's status feed");
		await expect(status.getByRole('link', { name: "Riot's status page" })).toHaveAttribute(
			'href',
			'https://status.riotgames.com/lol?region=jp1&locale=en_US'
		);
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

test.describe('the top-champions card without JavaScript', () => {
	test.use({ javaScriptEnabled: false });

	const card = (page: Page, heading = 'Top win rate · Ranked Solo') =>
		page.getByRole('region', { name: heading });

	test('a role tab shows that role, and every control keeps it', async ({ page }) => {
		await page.goto('/');
		await card(page)
			.getByRole('navigation', { name: 'Role' })
			.getByRole('link', { name: 'Mid' })
			.click();
		await expect(page).toHaveURL('/?role=mid');

		await expect(card(page)).toContainText('All patches · Mid · min. 800 games');
		await expect(card(page).locator('tbody').getByRole('row')).toHaveCount(6);
		await expect(
			card(page).getByRole('navigation', { name: 'Role' }).getByRole('link', { name: 'Mid' })
		).toHaveAttribute('aria-current', 'page');
		// The pill still counts every role.
		await expect(page.getByText('21,159 ranked games analysed')).toBeVisible();
		await expect(card(page).getByRole('link', { name: 'All champions' })).toHaveAttribute(
			'href',
			'/champions?role=mid&sort=win'
		);
		await expect(card(page).getByRole('link', { name: 'Pick rate' })).toHaveAttribute(
			'href',
			'/?role=mid&sort=pick'
		);

		// The region picker keeps the card's view.
		const picker = page.getByRole('form', { name: 'Region' });
		await picker.getByRole('combobox', { name: 'Region' }).selectOption({ label: 'Korea' });
		await picker.getByRole('button', { name: 'Apply' }).click();
		await expect(page).toHaveURL('/?region=kr&role=mid');
		await expect(card(page)).toContainText('Mid · min. 800 games');
		await expect(
			card(page).getByRole('navigation', { name: 'Role' }).getByRole('link', { name: 'All roles' })
		).toHaveAttribute('href', '/?region=kr');
	});

	test("this patch is riot-proxy's newest, and says when no champion has 100 games", async ({
		page
	}) => {
		await page.goto('/');
		const patch = card(page).getByRole('navigation', { name: 'Patch' });
		await expect(patch.getByRole('link', { name: 'All patches' })).toHaveAttribute(
			'aria-current',
			'page'
		);
		await patch.getByRole('link', { name: 'This patch' }).click();
		await expect(page).toHaveURL('/?patch=newest');

		await expect(card(page)).toContainText('No champion has 100 games for Patch 16.20 yet.');
		await expect(card(page).getByRole('table')).toHaveCount(0);
		// The controls stay, to go back.
		await expect(patch.getByRole('link', { name: 'All patches' })).toHaveAttribute('href', '/');
		await expect(card(page).getByRole('link', { name: 'All champions' })).toHaveAttribute(
			'href',
			'/champions?patch=newest&sort=win'
		);
	});

	test('a column heading ranks by its rate', async ({ page }) => {
		await page.goto('/');
		await card(page).getByRole('link', { name: 'Ban rate' }).click();
		await expect(page).toHaveURL('/?sort=ban');

		const banned = card(page, 'Top ban rate · Ranked Solo');
		await expect(banned.getByRole('columnheader', { name: 'Ban rate' })).toHaveAttribute(
			'aria-sort',
			'descending'
		);
		// #, champion, bar, win, pick, ban, games.
		const bans = await banned
			.locator('tbody tr')
			.evaluateAll((rows) => rows.map((r) => parseFloat(r.children[5]?.textContent ?? '')));
		expect(bans).toHaveLength(6);
		expect(bans).toEqual(bans.toSorted((a, b) => b - a));
	});

	test('the tier applies with its button, keeping the region and the rest', async ({ page }) => {
		await page.goto('/?region=kr&sort=pick');
		const tier = card(page, 'Top pick rate · Ranked Solo').getByRole('form', { name: 'Tier' });
		await tier.getByRole('combobox', { name: 'Tier' }).selectOption({ label: 'Emerald+' });
		await tier.getByRole('button', { name: 'Apply' }).click();

		// The form writes `+` as `%2B`; the page tidies it.
		await expect(page).toHaveURL('/?region=kr&rank=emerald+&sort=pick');
		await expect(card(page, 'Top pick rate · Ranked Solo')).toContainText(
			'All patches · Emerald+ · min. 800 games'
		);
	});
});

test("the card's view has one URL, and is kept at the edge", async ({ request }) => {
	for (const [path, location] of [
		['/?sort=win', '/'],
		['/?patch=16.19', '/'],
		['/?patch=all', '/'],
		['/?role=feeder', '/'],
		['/?rank=emerald%2B', '/?rank=emerald+'],
		['/?sort=pick&role=mid&region=kr', '/?region=kr&role=mid&sort=pick']
	]) {
		const response = await request.get(path, { maxRedirects: 0 });
		expect(response.status(), path).toBe(307);
		expect(response.headers()['location'], path).toBe(location);
	}
	const filtered = await request.get('/?region=kr&role=mid&sort=pick');
	expect(filtered.status()).toBe(200);
	expect(filtered.headers()['cache-control']).toBe(
		'public, s-maxage=60, stale-while-revalidate=120'
	);
});

test('with JavaScript, a role tab applies in place and keeps the scroll', async ({ page }) => {
	await page.setViewportSize({ width: 390, height: 700 });
	await page.goto('/');
	await hydrated(page);
	const mid = page
		.getByRole('region', { name: 'Top win rate · Ranked Solo' })
		.getByRole('navigation', { name: 'Role' })
		.getByRole('link', { name: 'Mid' });
	await mid.evaluate((link) => link.scrollIntoView({ block: 'center' }));
	const before = await page.evaluate(() => window.scrollY);
	expect(before).toBeGreaterThan(0);

	await mid.click();
	await expect(page).toHaveURL('/?role=mid');
	await expect(page.getByRole('region', { name: 'Top win rate · Ranked Solo' })).toContainText(
		'All patches · Mid'
	);
	expect(await page.evaluate(() => window.scrollY)).toBeGreaterThan(before / 2);
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

test('the Middle East is not offered until riot-proxy serves me1, and its URL redirects to /', async ({
	page,
	request
}) => {
	for (const path of ['/?region=me', '/?region=ME']) {
		const response = await request.get(path, { maxRedirects: 0 });
		expect(response.status(), path).toBe(307);
		expect(response.headers()['location'], path).toBe('/');
		expect(response.headers()['cache-control'], path).toBe('no-store');
	}

	await page.goto('/');
	const picker = page
		.getByRole('region', { name: 'Server status' })
		.getByRole('combobox', { name: 'Region' });
	await expect(picker.getByRole('option')).toHaveCount(14);
	await expect(picker.getByRole('option', { name: 'Middle East' })).toHaveCount(0);
	await expect(picker.getByRole('option', { name: 'Korea' })).toHaveCount(1);
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

test('on a narrow screen, choosing a region keeps the scroll', async ({ page }) => {
	await page.setViewportSize({ width: 390, height: 700 });
	await page.goto('/');
	await hydrated(page);
	const picker = page
		.getByRole('region', { name: 'Server status' })
		.getByRole('combobox', { name: 'Region' });
	await picker.scrollIntoViewIfNeeded();
	const before = await page.evaluate(() => window.scrollY);
	expect(before).toBeGreaterThan(0);

	await picker.selectOption({ label: 'Korea' });
	await expect(page).toHaveURL('/?region=kr');
	await expect(page.getByRole('region', { name: 'Server status' })).toContainText(
		'Ranked queues are disabled'
	);
	// Not sent back to the top. Korea's open entries make the card longer, and
	// the browser's scroll anchoring keeps the picker in place.
	expect(await page.evaluate(() => window.scrollY)).toBeGreaterThan(before / 2);
	await expect(
		page.getByRole('region', { name: 'Server status' }).getByRole('combobox', { name: 'Region' })
	).toBeInViewport();
});
