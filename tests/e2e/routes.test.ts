import { expect, test, type Page } from '@playwright/test';

const LEGAL = "ninjagoldfinch.lol isn't endorsed by Riot Games";

async function search(page: Page, region: string, riotId: string) {
	const form = page.getByRole('banner').getByRole('search');
	await form.getByRole('combobox', { name: 'Region' }).selectOption(region);
	await form.getByRole('textbox', { name: 'Riot ID' }).fill(riotId);
	await form.getByRole('button', { name: 'Search' }).click();
}

test.describe('without JavaScript', () => {
	test.use({ javaScriptEnabled: false });

	test('searching a Riot ID opens its profile', async ({ page }) => {
		await page.goto('/');
		await search(page, 'kr', 'Hide on bush#KR1');

		await expect(page).toHaveURL('/summoner/kr/Hide%20on%20bush-KR1');
		await expect(page.getByRole('heading', { level: 1 })).toHaveText('Hide on bush#KR1');
		await expect(page.getByRole('main')).toContainText('Korea');
		await expect(page.locator('footer')).toContainText(LEGAL);
	});

	test('a Riot ID without a tag asks for one', async ({ page }) => {
		await page.goto('/');
		await search(page, 'kr', 'Hide on bush');

		await expect(page).toHaveURL(/\/search\?/);
		await expect(page.getByRole('heading', { level: 1 })).toHaveText('Search for a player');
		await expect(page.getByRole('main').getByRole('textbox')).toHaveValue('Hide on bush');
	});
});

test('a profile is cacheable at the edge', async ({ request }) => {
	const response = await request.get('/summoner/kr/Hide%20on%20bush-KR1');
	expect(response.status()).toBe(200);
	expect(response.headers()['cache-control']).toBe(
		'public, s-maxage=60, stale-while-revalidate=300'
	);
});

test('an unknown player shows not found', async ({ page }) => {
	const response = await page.goto('/summoner/kr/NoSuchPlayer000-XXXX');
	expect(response?.status()).toBe(404);
	await expect(page.getByRole('heading', { level: 1 })).toHaveText('Not found');
});

test('an unknown region shows not found', async ({ page }) => {
	const response = await page.goto('/summoner/mars/Hide%20on%20bush-KR1');
	expect(response?.status()).toBe(404);
});

test('opened profiles appear under recent searches', async ({ page }) => {
	await page.goto('/summoner/kr/Hide%20on%20bush-KR1');
	await expect(page.getByRole('heading', { level: 1 })).toHaveText('Hide on bush#KR1');
	await page.goto('/');

	const recent = page.getByRole('region', { name: 'Recent searches' });
	await expect(recent.getByRole('link', { name: /Hide on bush#KR1/ })).toHaveAttribute(
		'href',
		'/summoner/kr/Hide%20on%20bush-KR1'
	);
});

test('/about shows what the site is and the legal notice', async ({ page }) => {
	await page.goto('/about');
	await expect(page.getByRole('heading', { level: 1 })).toHaveText('About ninjagoldfinch.lol');
	await expect(page.getByRole('main')).toContainText(LEGAL);
});

test('/healthz answers without touching the proxy', async ({ request }) => {
	const response = await request.get('/healthz');
	expect(response.status()).toBe(200);
	expect(await response.json()).toEqual({ ok: true });
	expect(response.headers()['cache-control']).toBe('no-store');
});
