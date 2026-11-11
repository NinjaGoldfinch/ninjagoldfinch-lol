import { expect, test } from '@playwright/test';

// SPD-10: connections to the image hosts open early, and a page's main icon
// loads at once and first. Checked without JavaScript, as the server sends it.
test.use({ javaScriptEnabled: false });

const preconnects = (page: import('@playwright/test').Page) =>
	page
		.locator('head link[rel="preconnect"]')
		.evaluateAll((links) => links.map((l) => l.getAttribute('href')));

test('every page preconnects to Data Dragon; profile and match pages to CommunityDragon too', async ({
	page
}) => {
	await page.goto('/champions/ahri');
	expect(await preconnects(page)).toEqual(['https://ddragon.leagueoflegends.com']);

	for (const path of ['/summoner/NinjaGoldfinch-OCENZ', '/match/OC1_712351051']) {
		await page.goto(path);
		expect((await preconnects(page)).toSorted(), path).toEqual([
			'https://ddragon.leagueoflegends.com',
			'https://raw.communitydragon.org'
		]);
	}
});

test("the champion page's header icon and the profile icon load first", async ({ page }) => {
	await page.goto('/champions/ahri');
	const champion = page.locator('main img[src$="/champion/Ahri.png"]').first();
	await expect(champion).toHaveAttribute('loading', 'eager');
	await expect(champion).toHaveAttribute('fetchpriority', 'high');

	await page.goto('/summoner/NinjaGoldfinch-OCENZ');
	const profile = page.locator('header img[src*="/profileicon/"]');
	await expect(profile).not.toHaveAttribute('loading', 'lazy');
	await expect(profile).toHaveAttribute('fetchpriority', 'high');
});

test('every image keeps its size and decodes off the main thread', async ({ page }) => {
	// The fewest images each page shows from the fixtures. The front page's
	// are the top win rates the trimmed static data can name (ADR-076).
	for (const [path, least] of [
		['/', 2],
		['/?region=kr', 2],
		['/summoner/NinjaGoldfinch-OCENZ', 6],
		['/match/OC1_712351051?tab=builds&build=1', 6],
		['/champions/ahri', 6]
	] as const) {
		await page.goto(path);
		const images = await page.locator('img').evaluateAll((imgs) =>
			imgs.map((i) => ({
				src: i.getAttribute('src'),
				width: i.getAttribute('width'),
				height: i.getAttribute('height'),
				decoding: i.getAttribute('decoding')
			}))
		);
		expect(images.length, path).toBeGreaterThanOrEqual(least);
		for (const image of images) {
			expect(image.width, `${path} ${image.src}`).toBeTruthy();
			expect(image.height, `${path} ${image.src}`).toBeTruthy();
			expect(image.decoding, `${path} ${image.src}`).toBe('async');
		}
	}
});
