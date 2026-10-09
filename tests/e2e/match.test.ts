import { expect, test, type Page } from '@playwright/test';

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
		await expect(blue.getByRole('list', { name: 'Objectives' })).toContainText('Herald 0');
		// Opened by URL alone, nobody's line is highlighted.
		await expect(page.locator('tr[aria-current]')).toHaveCount(0);
		await expect(page.getByRole('link', { name: /^← Back/ })).toHaveCount(0);

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

		await expect(page).toHaveURL(`${MATCH}?player=NinjaGoldfinch-OCENZ`);
		// The profile's own champion is highlighted, and no one else's.
		const highlighted = page.locator('tr[aria-current="true"]');
		await expect(highlighted).toHaveCount(1);
		await expect(highlighted).toHaveAccessibleName('Ahri');
		await expect(highlighted).toHaveCSS('box-shadow', /inset/);

		// Without JavaScript, back goes to the player's profile.
		await page.getByRole('link', { name: 'Back to NinjaGoldfinch#OCENZ' }).click();
		await expect(page).toHaveURL('/summoner/oce/NinjaGoldfinch-OCENZ');
		await expect(page.locator('footer')).toContainText(LEGAL);
	});
});

test.describe('builds without JavaScript', () => {
	test.use({ javaScriptEnabled: false });

	test('a match page shows no build until one is asked for', async ({ page }) => {
		await page.goto(MATCH);
		await expect(page.getByRole('heading', { name: /^Build/ })).toHaveCount(0);

		// With no player to highlight, the header link opens Blue's top laner's build.
		await page.getByRole('link', { name: 'Builds', exact: true }).click();
		await expect(page).toHaveURL(`${MATCH}?build=1#build`);
		await expect(page.getByRole('heading', { name: /^Build/ })).toHaveText(
			'Build · Mordekaiser · TheYoungBull#1494'
		);
	});

	test("opened from a profile, the header link is that player's build", async ({ page }) => {
		await page.goto(`${MATCH}?player=NinjaGoldfinch-OCENZ`);
		await expect(page.getByRole('link', { name: 'Your build' })).toHaveAttribute(
			'href',
			`${MATCH}?player=NinjaGoldfinch-OCENZ&build=8#build`
		);
	});

	test('a build URL shows that build in the page: item order, skills and runes', async ({
		page
	}) => {
		await page.goto(`${MATCH}?player=NinjaGoldfinch-OCENZ&build=8`);
		const build = page.getByRole('region', { name: /^Build/ });
		await expect(build.getByRole('heading', { level: 2 })).toHaveText(
			'Build · Ahri · NinjaGoldfinch#OCENZ'
		);

		// The header repeats neither the summoner spells nor the keystone: the
		// scoreboard line has them, and the rune list has the keystone.
		await expect(build.getByRole('img', { name: 'Flash' })).toHaveCount(0);
		await expect(build.getByRole('img', { name: 'Deathfire Touch' })).toHaveCount(0);
		await expect(build.getByRole('list', { name: 'Primary runes' })).toContainText(
			'Deathfire Touch'
		);

		const steps = build.getByRole('list', { name: 'Item order' }).locator(':scope > li');
		await expect(steps).toHaveCount(16);
		await expect(steps.first()).toContainText('0 min');
		await expect(steps.first().getByRole('img', { name: "Doran's Ring" })).toBeVisible();
		// Two Health Potions at 0 min stack as one icon with a count.
		await expect(steps.first().getByRole('img')).toHaveCount(3);
		await expect(steps.first().getByRole('img', { name: '2 × Health Potion' })).toBeVisible();
		await expect(build.getByRole('img', { name: /^Sold / })).toHaveCount(1);

		await expect(build).toContainText('Skill order · Q > W > E');
		const grid = build.getByRole('table', { name: 'Skill points by champion level' });
		await expect(grid.getByRole('columnheader')).toHaveCount(16);
		await expect(grid.getByRole('row', { name: /^W/ }).getByRole('cell').first()).toHaveText('W');

		await expect(build.getByRole('list', { name: 'Primary runes' })).toContainText(
			'Deathfire Touch'
		);
		await expect(build).toContainText('Sorcery');
		await expect(build.getByRole('list', { name: 'Stat shards' }).getByRole('img')).toHaveCount(3);
		await expect(build.getByRole('img', { name: 'Adaptive Force' })).toHaveAttribute(
			'src',
			'https://raw.communitydragon.org/16.20/plugins/rcp-be-lol-game-data/global/default/v1/perk-images/statmods/statmodsadaptiveforceicon.png'
		);
	});

	test("a champion on the scoreboard shows that player's build, keeping the highlight", async ({
		page
	}) => {
		await page.goto(`${MATCH}?player=NinjaGoldfinch-OCENZ`);
		await page.getByRole('link', { name: "Show Kai'Sa's build" }).click();

		await expect(page).toHaveURL(`${MATCH}?player=NinjaGoldfinch-OCENZ&build=9#build`);
		await expect(page.getByRole('heading', { name: /^Build/ })).toHaveText(
			"Build · Kai'Sa · Demacia123#6666"
		);
		await expect(page.locator('tr[aria-current="true"]')).toHaveAccessibleName('Ahri');

		// Closing loads the page without the build.
		await page.getByRole('link', { name: 'Close build' }).click();
		await expect(page).toHaveURL(`${MATCH}?player=NinjaGoldfinch-OCENZ`);
		await expect(page.getByRole('heading', { name: /^Build/ })).toHaveCount(0);
	});
});

test.describe('build popup', () => {
	const popup = (page: Page) => page.getByRole('dialog', { name: /^Build/ });
	const isModal = (page: Page) => popup(page).evaluate((d) => d.matches(':modal'));

	test('a champion opens its build in a popup, and Back closes it', async ({ page }) => {
		await page.goto(`${MATCH}?player=NinjaGoldfinch-OCENZ`);
		await page.getByRole('link', { name: "Show Kai'Sa's build" }).click();

		await expect(popup(page)).toBeVisible();
		expect(await isModal(page)).toBe(true);
		await expect(popup(page).getByRole('heading', { level: 2 })).toHaveText(
			"Build · Kai'Sa · Demacia123#6666"
		);
		await expect(page).toHaveURL(`${MATCH}?player=NinjaGoldfinch-OCENZ&build=9#build`);
		await expect(page.getByRole('link', { name: "Show Kai'Sa's build" })).toHaveClass(
			/ring-accent/
		);

		await page.goBack();
		await expect(popup(page)).toHaveCount(0);
		await expect(page).toHaveURL(`${MATCH}?player=NinjaGoldfinch-OCENZ`);
	});

	test('Escape, the close button and the backdrop each close it', async ({ page }) => {
		await page.goto(`${MATCH}?player=NinjaGoldfinch-OCENZ`);
		const open = async () => {
			await page.getByRole('link', { name: 'Your build' }).click();
			await expect(popup(page)).toBeVisible();
		};
		const closed = async () => {
			await expect(popup(page)).toHaveCount(0);
			await expect(page).toHaveURL(`${MATCH}?player=NinjaGoldfinch-OCENZ`);
		};

		await open();
		await expect(popup(page)).toContainText('Build · Ahri · NinjaGoldfinch#OCENZ');
		await page.keyboard.press('Escape');
		await closed();

		await open();
		await popup(page).getByRole('link', { name: 'Close build' }).click();
		await closed();

		await open();
		await page.mouse.click(5, 5);
		await closed();
	});

	test('a build URL opens as a popup; closing it leaves the page in place', async ({ page }) => {
		await page.goto('/summoner/oce/NinjaGoldfinch-OCENZ?queue=420');
		await page.goto(`${MATCH}?player=NinjaGoldfinch-OCENZ&build=8`);
		await expect(popup(page)).toBeVisible();
		expect(await isModal(page)).toBe(true);

		await page.keyboard.press('Escape');
		await expect(popup(page)).toHaveCount(0);
		await expect(page).toHaveURL(`${MATCH}?player=NinjaGoldfinch-OCENZ`);
		// Closing replaced the entry rather than adding one, so Back leaves the match.
		await page.goBack();
		await expect(page).toHaveURL('/summoner/oce/NinjaGoldfinch-OCENZ?queue=420');
	});

	test('after a popup, back still leads to the profile', async ({ page }) => {
		await page.goto('/summoner/oce/NinjaGoldfinch-OCENZ?queue=420');
		await page.getByRole('link', { name: 'Details of this match' }).first().click();
		await page.getByRole('link', { name: "Show Kai'Sa's build" }).click();
		await expect(popup(page)).toBeVisible();
		await page.keyboard.press('Escape');
		await expect(popup(page)).toHaveCount(0);

		await page.getByRole('link', { name: 'Back to NinjaGoldfinch#OCENZ' }).click();
		await expect(page).toHaveURL('/summoner/oce/NinjaGoldfinch-OCENZ?queue=420');
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
	await expect(page).toHaveURL(`${MATCH}?player=NinjaGoldfinch-OCENZ`);
	await expect(page.locator('tr[aria-current="true"]')).toHaveAccessibleName('Ahri');
	await expect(page.getByRole('heading', { level: 1 })).toHaveText('Ranked Solo');
	await expect(page.getByRole('banner').getByRole('combobox', { name: 'Region' })).toHaveValue(
		'oce'
	);
});

test('with JavaScript, back returns to the profile page the match was opened from', async ({
	page
}) => {
	await page.goto('/summoner/oce/NinjaGoldfinch-OCENZ?queue=420');
	await page.getByRole('link', { name: 'Details of this match' }).first().click();
	await expect(page).toHaveURL(`${MATCH}?player=NinjaGoldfinch-OCENZ`);

	await page.getByRole('link', { name: 'Back to NinjaGoldfinch#OCENZ' }).click();
	// The filter is kept, because this is the browser's own back.
	await expect(page).toHaveURL('/summoner/oce/NinjaGoldfinch-OCENZ?queue=420');
	await expect(page.getByRole('combobox', { name: 'Queue' })).toHaveValue('420');
});

test('a player link names the line to highlight, whatever its case', async ({ page }) => {
	await page.goto(`${MATCH}?player=ninjagoldfinch-ocenz`);
	await expect(page.locator('tr[aria-current="true"]')).toHaveAccessibleName('Ahri');
	await page.goto(`${MATCH}?player=Nobody-0000`);
	await expect(page.locator('tr[aria-current]')).toHaveCount(0);
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
