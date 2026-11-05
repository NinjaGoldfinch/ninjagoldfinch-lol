import { expect, test, type Page } from '@playwright/test';
import { hydrated } from './hydrated.ts';

// The CSP and the other security headers on every kind of page, and no
// violation while the pages are used, with JavaScript and without (ADR-055).

const PROFILE = '/summoner/NinjaGoldfinch-OCENZ';
const MATCH = '/match/OC1_712351051';
const PAGES = ['/', '/about', PROFILE, MATCH, '/champions', '/champions/ahri'];

const HEADERS = {
	'strict-transport-security': 'max-age=31536000',
	'x-content-type-options': 'nosniff',
	'referrer-policy': 'strict-origin-when-cross-origin',
	'x-frame-options': 'DENY',
	'cross-origin-opener-policy': 'same-origin',
	'permissions-policy':
		'accelerometer=(), camera=(), geolocation=(), gyroscope=(), magnetometer=(), microphone=(), payment=(), usb=()'
};

// SvelteKit adds the hash of each page's inline bootstrap script to script-src.
const CSP = new RegExp(
	'^' +
		[
			"default-src 'self'",
			"connect-src 'self' https://cloudflareinsights\\.com",
			"font-src 'self'",
			"img-src 'self' data: https://ddragon\\.leagueoflegends\\.com https://raw\\.communitydragon\\.org",
			"object-src 'none'",
			"script-src 'self' https://static\\.cloudflareinsights\\.com 'sha256-[A-Za-z0-9+/]+={0,2}'",
			"style-src 'self'",
			"style-src-attr 'unsafe-inline'",
			"base-uri 'self'",
			"form-action 'self'",
			"frame-ancestors 'none'"
		].join('; ') +
		'$'
);

for (const path of PAGES) {
	test(`${path} carries the CSP and the security headers`, async ({ request }) => {
		const response = await request.get(path);
		expect(response.status()).toBe(200);
		const headers = response.headers();
		expect(headers['content-security-policy']).toMatch(CSP);
		for (const [name, value] of Object.entries(HEADERS)) expect(headers[name], name).toBe(value);
	});
}

test('/ and /about are rendered per request and cached at the edge for 10 minutes', async ({
	request
}) => {
	for (const path of ['/', '/about']) {
		const response = await request.get(path);
		expect(response.headers()['cache-control']).toBe(
			'public, s-maxage=600, stale-while-revalidate=600'
		);
	}
});

test('a redirect and a not-found page carry the headers too', async ({ request }) => {
	const redirect = await request.get('/champions?patch=all', { maxRedirects: 0 });
	expect(redirect.status()).toBe(307);
	expect(redirect.headers()['x-frame-options']).toBe('DENY');

	const missing = await request.get('/summoner/NoSuchPlayer000-XXXX');
	expect(missing.status()).toBe(404);
	expect(missing.headers()['content-security-policy']).toMatch(CSP);
	expect(missing.headers()['strict-transport-security']).toBe('max-age=31536000');
});

/** Collects every CSP violation the page reports, as an event or on the console. */
async function watchViolations(page: Page, javaScript: boolean): Promise<string[]> {
	const violations: string[] = [];
	page.on('console', (message) => {
		if (/Refused to|Content Security Policy/i.test(message.text())) {
			violations.push(message.text());
		}
	});
	if (javaScript) {
		await page.exposeFunction('reportViolation', (text: string) => violations.push(text));
		await page.addInitScript(() => {
			document.addEventListener('securitypolicyviolation', (e) => {
				const report = (window as unknown as { reportViolation: (t: string) => void })
					.reportViolation;
				report(`${e.violatedDirective} blocked ${e.blockedURI} in ${e.sourceFile}`);
			});
		});
	}
	return violations;
}

test.describe('without JavaScript', () => {
	test.use({ javaScriptEnabled: false });

	test('no page breaks its CSP', async ({ page }) => {
		const violations = await watchViolations(page, false);
		for (const path of [...PAGES, `${MATCH}?tab=timeline`, `${MATCH}?build=8`]) {
			await page.goto(path);
			await expect(page.locator('footer')).toContainText("isn't endorsed by Riot Games");
		}
		await page.goto(PROFILE);
		await page.getByRole('button', { name: 'Refresh' }).click();
		await expect(page.getByRole('main')).toContainText(/Refresh available in/);

		expect(violations).toEqual([]);
	});
});

test.describe('with JavaScript', () => {
	test('using every page breaks no CSP', async ({ page }) => {
		const violations = await watchViolations(page, true);

		// Recent searches, read from localStorage, and client navigation.
		await page.goto(PROFILE);
		// The profile records itself once hydrated; leaving before then records nothing.
		await page.waitForFunction(() => localStorage.getItem('recent-searches')?.includes('OCENZ'));
		await page.goto('/');
		await expect(page.getByRole('link', { name: 'NinjaGoldfinch#OCENZ' })).toBeVisible();
		await page.getByRole('link', { name: 'About' }).first().click();
		await expect(page).toHaveURL('/about');

		// Profile: Refresh and its countdown, the inline teams, a queue filter.
		await page.goto(PROFILE);
		await hydrated(page);
		await page.getByRole('button', { name: 'Refresh' }).click();
		await expect(page.getByRole('main')).toContainText(/Refresh available in/);
		const row = page.getByRole('article', { name: 'Victory as Ahri' }).first();
		await row.getByRole('button', { name: 'Show the teams' }).click();
		await expect(row.getByRole('rowgroup', { name: 'Victory · Red team' })).toBeVisible();
		await page.getByRole('combobox', { name: 'Queue' }).selectOption({ label: 'Ranked Solo' });
		await expect(page).toHaveURL(`${PROFILE}?queue=420`);

		// Match: the build popup, the Timeline tab and the chart's crosshair.
		await page.goto(`${MATCH}?player=NinjaGoldfinch-OCENZ`);
		await page.getByRole('link', { name: "Show Kai'Sa's build" }).click();
		await expect(page.getByRole('dialog', { name: /^Build/ })).toBeVisible();
		await page.keyboard.press('Escape');
		await page.getByRole('link', { name: 'Timeline' }).click();
		const chart = page.getByRole('region', { name: 'Gold difference' });
		const plot = chart.getByRole('img', { name: /^Gold difference/ });
		const box = await plot.boundingBox();
		if (!box) throw new Error('the chart has no box');
		await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
		await expect(chart.getByText(/^\d+:00$/)).toBeVisible();

		// Champions: sort, a role tab, the tier picker, a champion and a build tab.
		await page.goto('/champions');
		await page.getByRole('link', { name: 'Win rate' }).click();
		await page.getByRole('link', { name: 'Mid' }).click();
		await expect(page).toHaveURL(/role=mid/);
		await page.goto('/champions');
		await hydrated(page);
		// With JavaScript the picker applies itself on change.
		await page.getByRole('combobox', { name: 'Tier' }).selectOption({ label: 'Emerald+' });
		await expect(page).toHaveURL(/rank=emerald\+/);
		await page.getByRole('link', { name: 'Ahri', exact: true }).click();
		await expect(page).toHaveURL(/\/champions\/ahri/);
		await page.getByRole('navigation', { name: 'Builds' }).getByRole('link').nth(1).click();

		expect(violations).toEqual([]);
	});
});
