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

	test('a build URL shows that build in the page: items, skills, shop visits and runes', async ({
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

		// Starter, boots, skill order and finished items, by riot-proxy's definitions.
		const summary = build.getByRole('group', { name: 'Build summary' });
		await expect(summary.getByRole('img', { name: "Doran's Ring" })).toBeVisible();
		await expect(summary.getByRole('img', { name: '2 × Health Potion' })).toBeVisible();
		// The trinket bought with the starter isn't part of it.
		await expect(summary.getByRole('img', { name: 'Stealth Ward' })).toHaveCount(0);
		await expect(summary.getByRole('img', { name: 'Ionian Boots of Lucidity' })).toBeVisible();
		await expect(summary).toContainText('Q › W › E');
		const items = summary.getByRole('list', { name: 'Finished items' }).getByRole('listitem');
		await expect(items).toHaveCount(3);
		await expect(items.first().getByRole('img', { name: 'Blackfire Torch' })).toBeVisible();
		await expect(items.first()).toContainText('10:49');

		await expect(build).toContainText('Skill order · Q › W › E');
		const grid = build.getByRole('table', { name: 'Skill points in the order taken' });
		await expect(grid.getByRole('columnheader')).toHaveCount(18);
		await expect(grid.getByRole('row', { name: /^W/ }).getByRole('cell').first()).toHaveText('W');

		// Purchases less than 30 s apart are one visit; sales aren't shown.
		const visits = build.getByRole('list', { name: 'Shop visits' }).locator(':scope > li');
		await expect(visits).toHaveCount(16);
		await expect(visits.first()).toContainText('0:15');
		await expect(visits.first().getByRole('img')).toHaveCount(3);
		await expect(build.getByRole('img', { name: /^Sold / })).toHaveCount(0);

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

test.describe('timeline tab without JavaScript', () => {
	test.use({ javaScriptEnabled: false });

	test('the Timeline tab shows the gold difference and objectives in place of the scoreboard', async ({
		page
	}) => {
		await page.goto(`${MATCH}?player=NinjaGoldfinch-OCENZ`);
		const tabs = page.getByRole('navigation', { name: 'Match views' });
		await expect(tabs.getByRole('link', { name: 'Scoreboard' })).toHaveAttribute(
			'aria-current',
			'page'
		);
		await expect(page.getByRole('heading', { name: 'Gold difference' })).toHaveCount(0);

		await tabs.getByRole('link', { name: 'Timeline' }).click();
		await expect(page).toHaveURL(`${MATCH}?player=NinjaGoldfinch-OCENZ&tab=timeline`);
		await expect(tabs.getByRole('link', { name: 'Timeline' })).toHaveAttribute(
			'aria-current',
			'page'
		);
		await expect(page.getByRole('region', { name: /team$/ })).toHaveCount(0);

		const chart = page.getByRole('region', { name: 'Gold difference' });
		// The figures from the recorded timeline (checked in the unit tests).
		await expect(chart).toContainText("Blue team's largest lead: +716 at 7:00");
		await expect(chart).toContainText("Red team's largest lead: +8,153 at 32:32");
		await expect(chart.getByRole('img', { name: /^Gold difference/ })).toHaveAccessibleName(
			'Gold difference over 32:32: Red team +8,153 at the end'
		);
		// Without JavaScript each frame's lead (0–32 minutes and the end) is a hover title.
		await expect(chart.getByRole('img').locator('title')).toHaveCount(34);
		await expect(chart.getByText('−8.2k', { exact: true })).toBeVisible();

		await chart.getByText('Objectives taken (24)').click();
		const rows = chart.getByRole('table').getByRole('row');
		await expect(rows).toHaveCount(25);
		await expect(rows.nth(4)).toContainText('9:15Red teamHextech Drake');
		await expect(rows.last()).toContainText('32:19Red teamNexus tower');
		await expect(chart.getByRole('row', { name: /Baron Nashor/ })).toHaveCount(2);

		// The highlight is kept, and Scoreboard goes back.
		await tabs.getByRole('link', { name: 'Scoreboard' }).click();
		await expect(page).toHaveURL(`${MATCH}?player=NinjaGoldfinch-OCENZ`);
		await expect(page.locator('tr[aria-current="true"]')).toHaveAccessibleName('Ahri');
	});

	test('a build opened from the Timeline tab keeps it', async ({ page }) => {
		await page.goto(`${MATCH}?player=NinjaGoldfinch-OCENZ&tab=timeline`);
		await page.getByRole('link', { name: 'Your build' }).click();
		await expect(page).toHaveURL(`${MATCH}?player=NinjaGoldfinch-OCENZ&tab=timeline&build=8#build`);
		await expect(page.getByRole('heading', { name: 'Gold difference' })).toBeVisible();
		await page.getByRole('link', { name: 'Close build' }).click();
		await expect(page).toHaveURL(`${MATCH}?player=NinjaGoldfinch-OCENZ&tab=timeline`);
	});
});

test('with JavaScript, switching tab adds no history, so back still leaves the match', async ({
	page
}) => {
	await page.goto('/summoner/oce/NinjaGoldfinch-OCENZ?queue=420');
	await page.getByRole('link', { name: 'Details of this match' }).first().click();
	await expect(page).toHaveURL(`${MATCH}?player=NinjaGoldfinch-OCENZ`);
	// The load doesn't read the URL, so switching tab asks the server for nothing.
	const loads: string[] = [];
	page.on('request', (r) => {
		if (r.url().includes('__data.json')) loads.push(r.url());
	});
	const tabs = page.getByRole('navigation', { name: 'Match views' });
	await tabs.getByRole('link', { name: 'Timeline' }).click();
	await expect(page).toHaveURL(`${MATCH}?player=NinjaGoldfinch-OCENZ&tab=timeline`);
	await expect(page.getByRole('heading', { name: 'Gold difference' })).toBeVisible();
	await tabs.getByRole('link', { name: 'Scoreboard' }).click();
	await expect(page.locator('tr[aria-current="true"]')).toHaveAccessibleName('Ahri');
	await tabs.getByRole('link', { name: 'Timeline' }).click();
	await expect(page.getByRole('heading', { name: 'Gold difference' })).toBeVisible();
	expect(loads).toEqual([]);

	await page.getByRole('link', { name: 'Back to NinjaGoldfinch#OCENZ' }).click();
	await expect(page).toHaveURL('/summoner/oce/NinjaGoldfinch-OCENZ?queue=420');
});

test.describe('inline match on the profile', () => {
	const PROFILE = '/summoner/oce/NinjaGoldfinch-OCENZ';

	test('a row shows both teams in place, from the match page cached at the edge', async ({
		page
	}) => {
		const loads: { url: string; cacheControl: string | undefined }[] = [];
		page.on('response', (r) => {
			if (r.url().includes('__data.json')) {
				loads.push({ url: r.url(), cacheControl: r.headers()['cache-control'] });
			}
		});
		await page.goto(PROFILE);
		const row = page.getByRole('article', { name: 'Victory as Ahri' }).first();
		await row.getByRole('button', { name: 'Show the teams' }).click();

		const blue = row.getByRole('rowgroup', { name: 'Defeat · Blue team' });
		const red = row.getByRole('rowgroup', { name: 'Victory · Red team' });
		await expect(blue.getByRole('row')).toHaveCount(6);
		await expect(red.getByRole('row')).toHaveCount(6);
		await expect(blue).toContainText('28 / 44 / 18');
		const own = row.locator('tr[aria-current="true"]');
		await expect(own).toHaveAccessibleName('Ahri');
		await expect(own).toContainText('NinjaGoldfinch#OCENZ');
		await expect(own).toContainText('8 / 8 / 10');
		await expect(own.getByRole('list', { name: 'Items' }).getByRole('img')).toHaveCount(7);
		await expect(row.getByRole('button', { name: 'Hide the teams' })).toHaveAttribute(
			'aria-expanded',
			'true'
		);

		// No navigation: the profile stays, and the match page's load answered.
		await expect(page).toHaveURL(PROFILE);
		expect(loads).toHaveLength(1);
		expect(loads[0].url).toContain('/match/oce/OC1_712351051/__data.json');
		expect(loads[0].cacheControl).toBe('public, s-maxage=86400, stale-while-revalidate=86400');

		// Hiding and showing again asks for nothing more.
		await row.getByRole('button', { name: 'Hide the teams' }).click();
		await expect(blue).toHaveCount(0);
		await row.getByRole('button', { name: 'Show the teams' }).click();
		await expect(blue.getByRole('row')).toHaveCount(6);
		expect(loads).toHaveLength(1);

		// A player in it links to their profile.
		await expect(row.getByRole('link', { name: 'Demacia123#6666' })).toHaveAttribute(
			'href',
			'/summoner/oce/Demacia123-6666'
		);
	});

	test("a match that can't be loaded says so, with a link to its page", async ({ page }) => {
		await page.goto(PROFILE);
		const row = page.getByRole('article').nth(1);
		await row.getByRole('button', { name: 'Show the teams' }).click();
		await expect(row).toContainText("The teams couldn't be loaded.");
		await expect(row.getByRole('link', { name: 'Open the match page' })).toHaveAttribute(
			'href',
			'/match/oce/OC1_712345690?player=NinjaGoldfinch-OCENZ'
		);
	});

	test.describe('without JavaScript', () => {
		test.use({ javaScriptEnabled: false });

		test('a row has only its Details link', async ({ page }) => {
			await page.goto(PROFILE);
			const row = page.getByRole('article').first();
			await expect(row.getByRole('button')).toHaveCount(0);
			await expect(row.getByRole('link', { name: 'Details of this match' })).toBeVisible();
		});
	});
});

test('with JavaScript, pointing at the gold chart reads out the nearest minute', async ({
	page
}) => {
	await page.goto(`${MATCH}?tab=timeline`);
	const chart = page.getByRole('region', { name: 'Gold difference' });
	const plot = chart.getByRole('img', { name: /^Gold difference/ });
	// The crosshair replaces the per-frame <title> bands.
	await expect(plot.locator('title')).toHaveCount(0);
	await expect(chart.getByText('Red team +5,519')).toHaveCount(0);

	// The recorded game lasts 32:32; 24:00 is Red's lead before Blue's Baron.
	const box = await plot.boundingBox();
	if (!box) throw new Error('the chart has no box');
	await page.mouse.move(box.x + box.width * ((24 * 60) / 1952), box.y + box.height / 2);
	await expect(chart.getByText('24:00')).toBeVisible();
	await expect(chart.getByText('Red team +5,519')).toBeVisible();

	await page.mouse.move(0, 0);
	await expect(chart.getByText('Red team +5,519')).toHaveCount(0);
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
