import { expect, test, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';

const LEGAL = "ninjagoldfinch.lol isn't endorsed by Riot Games";

// A profile records itself under recent searches once hydrated, from client
// JavaScript; leaving the page before then records nothing. On a slow machine
// the server-rendered heading shows well before that.
async function recorded(page: Page, name: string) {
	await page.waitForFunction(
		(name) => localStorage.getItem('recent-searches')?.includes(name),
		name
	);
}

async function search(page: Page, riotId: string) {
	const form = page.getByRole('banner').getByRole('search');
	await form.getByRole('textbox', { name: 'Riot ID or champion' }).fill(riotId);
	await form.getByRole('button', { name: 'Search' }).click();
}

test.describe('without JavaScript', () => {
	test.use({ javaScriptEnabled: false });

	test('searching a Riot ID opens its profile', async ({ page }) => {
		await page.goto('/');
		await search(page, 'NinjaGoldfinch#OCENZ');

		await expect(page).toHaveURL('/summoner/NinjaGoldfinch-OCENZ');
		await expect(page.getByRole('heading', { level: 1 })).toHaveText('NinjaGoldfinch#OCENZ');
		await expect(page.getByRole('main')).toContainText('Oceania · Level 458');
		await expect(page.locator('footer')).toContainText(LEGAL);
	});

	test('a profile shows its header, rank and the first page of matches', async ({ page }) => {
		await page.goto('/summoner/NinjaGoldfinch-OCENZ');

		const main = page.getByRole('main');
		await expect(main.locator('img').first()).toHaveAttribute(
			'src',
			'https://ddragon.leagueoflegends.com/cdn/16.20.1/img/profileicon/7173.png'
		);
		// From riot-proxy's fetchedAgeSeconds: the summoner part, read 602 s ago (ADR-019).
		await expect(main).toContainText('Updated 10 minutes ago');
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
		await expect(first.getByRole('img', { name: 'Mid', exact: true })).toHaveAttribute(
			'src',
			/communitydragon\.org\/16\.20\/.*icon-position-middle\.png$/
		);
		// Lane icons draw the map in a dim tone behind the lane; fading the whole
		// badge left Mid, Top and Bot washed out next to Jungle.
		const lane = first.getByRole('img', { name: 'Mid', exact: true });
		await expect(lane).toHaveCSS('opacity', '1');
		await expect(lane).toHaveCSS('filter', /brightness\(1\.1\)/);
		await expect(first.getByTitle('Champion level 16')).toHaveText('Level 16');
		await expect(first.getByRole('img', { name: 'Precision' })).toBeVisible();
		// One line: six items then the trinket. A mid laner has no role quest
		// slot after it: only bot laners' (their boots) is shown.
		const items = first.getByRole('list', { name: 'Items' });
		await expect(items).toHaveCSS('display', 'flex');
		await expect(items).toHaveCSS('flex-wrap', 'nowrap');
		await expect(items.getByRole('img')).toHaveCount(7);
		await expect(items.getByRole('listitem').nth(6).getByRole('img')).toHaveAttribute(
			'alt',
			'Farsight Alteration'
		);
		await expect(first.getByRole('img', { name: 'Mid Lane Quest Reward' })).toHaveCount(0);
		await expect(first.getByRole('img', { name: "Doran's Ring" })).toBeVisible();
		// A game with slot 4 empty draws its items packed left, the gap before
		// the trinket, which stays last.
		const slots = matches.nth(6).getByRole('list', { name: 'Items' }).getByRole('listitem');
		await expect(slots).toHaveCount(7);
		await expect(slots.nth(4).getByRole('img')).toHaveAccessibleName("Lord Dominik's Regards");
		await expect(slots.nth(5).getByRole('img')).toHaveCount(0);
		await expect(slots.nth(6).getByRole('img')).toHaveAccessibleName('Oracle Lens');
	});

	test('refresh re-reads the profile and starts the cooldown', async ({ page }) => {
		await page.goto('/summoner/NinjaGoldfinch-OCENZ');
		await page.getByRole('button', { name: 'Refresh' }).click();

		await expect(page.getByRole('heading', { level: 1 })).toHaveText('NinjaGoldfinch#OCENZ');
		await expect(page.getByRole('button', { name: 'Refresh' })).toBeDisabled();
		await expect(page.getByRole('main')).toContainText(
			'Updated just now · Refresh available in 60s'
		);
	});

	test('a name with no tag and no champion match asks for the tag', async ({ page }) => {
		await page.goto('/');
		await search(page, 'NinjaGoldfinch');

		await expect(page).toHaveURL(/\/search\?/);
		await expect(page.getByRole('heading', { level: 1 })).toHaveText('Search');
		const main = page.getByRole('main');
		// The champion names are suggested now, so the box is a combobox.
		await expect(main.getByRole('combobox', { name: 'Riot ID or champion' })).toHaveValue(
			'NinjaGoldfinch'
		);
		await expect(main).toContainText(
			"No champion matches 'NinjaGoldfinch'. A Riot ID needs its #TAG."
		);
	});

	test("a champion's name opens its builds", async ({ page }) => {
		await page.goto('/');
		await search(page, 'AHRI');
		await expect(page).toHaveURL('/champions/ahri#builds');
		await expect(page.getByRole('heading', { level: 1 })).toHaveText('Ahri');
	});

	test('an ambiguous champion prefix lists the matches', async ({ page }) => {
		await page.goto('/');
		await search(page, 'sy');
		await expect(page.getByRole('main')).toContainText("'sy' matches Sylas, Syndra. Keep typing.");
		await expect(page.getByRole('main')).toContainText('Keep typing.');
	});

	test('a malformed Riot ID says how to write one', async ({ page }) => {
		await page.goto('/');
		await search(page, 'NinjaGoldfinch#');
		await expect(page.getByRole('main')).toContainText(
			'A Riot ID is Game name#TAG: up to 16 characters before the #, up to 5 after.'
		);
	});
});

test('a profile is cacheable at the edge', async ({ request }) => {
	const response = await request.get('/summoner/NinjaGoldfinch-OCENZ');
	expect(response.status()).toBe(200);
	expect(response.headers()['cache-control']).toBe(
		'public, s-maxage=60, stale-while-revalidate=300'
	);
});

test('an unknown player shows not found', async ({ page }) => {
	const response = await page.goto('/summoner/NoSuchPlayer000-XXXX');
	expect(response?.status()).toBe(404);
	await expect(page.getByRole('heading', { level: 1 })).toHaveText('Not found');
});

test('a Riot ID of .. is not found, not another riot-proxy route', async ({ request }) => {
	expect((await request.get('/summoner/..-x')).status()).toBe(404);
	expect((await request.get(`/summoner/${'a'.repeat(17)}-OCE`)).status()).toBe(404);
});

test('an unknown region shows not found', async ({ page }) => {
	const response = await page.goto('/summoner/mars/NinjaGoldfinch-OCENZ');
	expect(response?.status()).toBe(404);
});

test('the champion panel summarises the matches shown', async ({ page }) => {
	await page.goto('/summoner/NinjaGoldfinch-OCENZ');

	const panel = page.getByRole('region', { name: 'Champions' });
	await expect(panel).toContainText('From the 10 matches shown');
	const rows = panel.getByRole('listitem');
	await expect(rows).toHaveCount(4);
	await expect(rows.first()).toHaveAccessibleName('Viego');
	await expect(rows.first()).toContainText('67%');
	await expect(rows.first()).toContainText('3.54 KDA · 7.1 CS/min');
	await expect(rows.first()).toContainText('4W 2L');
});

test('opened profiles appear under recent searches', async ({ page }) => {
	await page.goto('/summoner/NinjaGoldfinch-OCENZ');
	await expect(page.getByRole('heading', { level: 1 })).toHaveText('NinjaGoldfinch#OCENZ');
	await recorded(page, 'NinjaGoldfinch');
	await page.goto('/');

	const recent = page.getByRole('region', { name: 'Recent searches' });
	await expect(recent.getByRole('link', { name: /NinjaGoldfinch#OCENZ/ })).toHaveAttribute(
		'href',
		'/summoner/NinjaGoldfinch-OCENZ'
	);
});

test('a profile reached from another profile is remembered too', async ({ page }) => {
	await page.goto('/summoner/NinjaGoldfinch-OCENZ');
	await expect(page.getByRole('heading', { level: 1 })).toHaveText('NinjaGoldfinch#OCENZ');
	// The header search navigates in the page, keeping the profile component.
	await search(page, 'Synthetic#TEST');
	await expect(page.getByRole('heading', { level: 1 })).toHaveText('Synthetic#TEST');
	await recorded(page, 'Synthetic');
	await page.goto('/');

	const recent = page.getByRole('region', { name: 'Recent searches' });
	await expect(recent.getByRole('link', { name: /Synthetic#TEST/ })).toBeVisible();
	await expect(recent.getByRole('link', { name: /NinjaGoldfinch#OCENZ/ })).toBeVisible();
});

test('/about shows what the site is and the legal notice', async ({ page }) => {
	await page.goto('/about');
	await expect(page.getByRole('heading', { level: 1 })).toHaveText('About ninjagoldfinch.lol');
	await expect(page.getByRole('main')).toContainText(LEGAL);
});

test('/healthz answers with the version, without touching the proxy', async ({ request }) => {
	const { version } = JSON.parse(readFileSync('package.json', 'utf8')) as { version: string };
	const response = await request.get('/healthz');
	expect(response.status()).toBe(200);
	expect(await response.json()).toEqual({ ok: true, version });
	expect(response.headers()['cache-control']).toBe('no-store');
});

test('with JavaScript, refresh counts the cooldown down', async ({ page }) => {
	await page.goto('/summoner/NinjaGoldfinch-OCENZ');
	const button = page.getByRole('button', { name: 'Refresh' });
	await expect(button).toBeEnabled();
	await button.click();

	await expect(button).toBeDisabled();
	await expect(page.getByRole('main')).toContainText(/Refresh available in (59|60)s/);
	await expect(page.getByRole('main')).toContainText(/Refresh available in 5[0-8]s/, {
		timeout: 4000
	});
});

test('old profile and match URLs move permanently to the ones without a region', async ({
	request
}) => {
	const profile = await request.get('/summoner/oce/NinjaGoldfinch-OCENZ?queue=420', {
		maxRedirects: 0
	});
	expect(profile.status()).toBe(308);
	expect(profile.headers()['location']).toBe('/summoner/NinjaGoldfinch-OCENZ?queue=420');

	const match = await request.get('/match/oce/OC1_712351051?player=NinjaGoldfinch-OCENZ', {
		maxRedirects: 0
	});
	expect(match.status()).toBe(308);
	expect(match.headers()['location']).toBe('/match/OC1_712351051?player=NinjaGoldfinch-OCENZ');

	// An old URL with a region the site never had is not found, not redirected.
	expect((await request.get('/summoner/xx/Somebody-KR1', { maxRedirects: 0 })).status()).toBe(404);
});

test('a match id whose prefix names no region is not found', async ({ request }) => {
	expect((await request.get('/match/XX1_1')).status()).toBe(404);
});

test.describe('match filters and pages', () => {
	const PROFILE = '/summoner/NinjaGoldfinch-OCENZ';
	const firstMatch = (page: Page) =>
		page.getByRole('region', { name: 'Recent matches' }).getByRole('article').first();

	test('choosing a queue reloads with only that queue', async ({ page }) => {
		await page.goto(PROFILE);
		await page.getByRole('combobox', { name: 'Queue' }).selectOption({ label: 'Ranked Solo' });

		await expect(page).toHaveURL(`${PROFILE}?queue=420`);
		await expect(page.getByRole('combobox', { name: 'Queue' })).toHaveValue('420');
		await expect(firstMatch(page)).toContainText('Ranked Solo');
	});

	test("choosing a champion shows only that champion's games", async ({ page }) => {
		await page.goto(PROFILE);
		await page.getByRole('combobox', { name: 'Champion' }).selectOption({ label: 'Viego' });

		await expect(page).toHaveURL(`${PROFILE}?champion=234`);
		const rows = page.getByRole('region', { name: 'Recent matches' }).getByRole('article');
		await expect(rows).toHaveCount(10);
		for (const name of await rows.evaluateAll((els) =>
			els.map((e) => e.getAttribute('aria-label'))
		)) {
			expect(name).toMatch(/ as Viego$/);
		}
		// riot-proxy reports the archive complete, so no "still loading" note.
		await expect(page.getByText('older games are still loading')).toHaveCount(0);
	});

	test('a messy filter URL redirects to its clean form', async ({ request }) => {
		const response = await request.get(`${PROFILE}?page=1&queue=&champion=234&junk=1`, {
			maxRedirects: 0
		});
		expect(response.status()).toBe(307);
		expect(response.headers()['location']).toBe(`${PROFILE}?champion=234`);
	});

	test('Older and Newer move between pages, keeping the queue', async ({ page }) => {
		await page.goto(`${PROFILE}?queue=420`);
		await expect(page.getByRole('link', { name: 'Newer' })).toHaveCount(0);

		await page.goto(PROFILE);
		await page.getByRole('link', { name: 'Older' }).click();
		await expect(page).toHaveURL(`${PROFILE}?page=2`);
		await expect(page.getByRole('navigation', { name: 'Match pages' })).toContainText('Page 2');
		await expect(firstMatch(page)).not.toHaveAccessibleName('Victory as Ahri');

		await page.getByRole('link', { name: 'Newer' }).click();
		await expect(page).toHaveURL(PROFILE);
		await expect(firstMatch(page)).toHaveAccessibleName('Victory as Ahri');
	});

	test('refresh keeps the filter', async ({ page }) => {
		await page.goto(`${PROFILE}?page=2`);
		const form = page.locator('form', { has: page.getByRole('button', { name: 'Refresh' }) });
		await expect(form).toHaveAttribute('action', '?page=2&/refresh');
	});

	test.describe('without JavaScript', () => {
		test.use({ javaScriptEnabled: false });

		test('the queue filter applies with its button', async ({ page }) => {
			await page.goto(PROFILE);
			await page.getByRole('combobox', { name: 'Queue' }).selectOption('420');
			await page.getByRole('button', { name: 'Apply' }).click();
			await expect(page).toHaveURL(`${PROFILE}?queue=420`);
		});
	});
});

test('when match history fails, the profile still shows, uncached', async ({ page }) => {
	// Synthetic fixtures: this player's match page answers RATE_LIMITED, retry in 30 s.
	const response = await page.goto('/summoner/Synthetic-TEST');
	expect(response?.status()).toBe(200);
	expect(response?.headers()['cache-control']).toBe('no-store');

	await expect(page.getByRole('heading', { level: 1 })).toHaveText('Synthetic#TEST');
	await expect(page.getByRole('region', { name: 'Rank' })).toContainText('Emerald III');
	await expect(page.getByRole('status')).toContainText('Match history: Too many requests');
	await expect(page.getByRole('status')).toContainText('Try again in 30 seconds.');
	await expect(page.getByRole('region', { name: 'Champions' })).toHaveCount(0);
});

test('error pages are not cached, except briefly for not found', async ({ request }) => {
	const missing = await request.get('/summoner/NoSuchPlayer000-XXXX');
	expect(missing.status()).toBe(404);
	expect(missing.headers()['cache-control']).toBe('public, s-maxage=60');

	// No fixture exists for this player, so the mock answers 500 and the page is unavailable.
	const broken = await request.get('/summoner/kr/Somebody-KR1');
	expect(broken.status()).toBe(503);
	expect(broken.headers()['cache-control']).toBe('no-store');
});

test('redirects and failed data requests are never cached', async ({ request }) => {
	const old = await request.get('/summoner/oce/NinjaGoldfinch-OCENZ', { maxRedirects: 0 });
	expect(old.status()).toBe(308);
	expect(old.headers()['cache-control']).toBe('no-store');

	const messy = await request.get('/champions?junk=1', { maxRedirects: 0 });
	expect(messy.status()).toBe(307);
	expect(messy.headers()['cache-control']).toBe('no-store');

	// SvelteKit answers a data request whose load threw 200, with the error
	// inside, and marks it uncached itself.
	const data = await request.get('/summoner/Somebody-KR1/__data.json');
	expect(data.status()).toBe(200);
	expect(await data.text()).toContain('"type":"error"');
	expect(data.headers()['cache-control']).toBe('private, no-store');
});

test("a champion's name moves for good, its query only for now", async ({ request }) => {
	const name = await request.get('/champions/Ahri?role=mid', { maxRedirects: 0 });
	expect(name.status()).toBe(308);
	expect(name.headers()['location']).toBe('/champions/ahri?role=mid');

	const query = await request.get('/champions/ahri?role=mid&junk=1', { maxRedirects: 0 });
	expect(query.status()).toBe(307);
	expect(query.headers()['location']).toBe('/champions/ahri?role=mid');
	expect(query.headers()['cache-control']).toBe('no-store');
});
