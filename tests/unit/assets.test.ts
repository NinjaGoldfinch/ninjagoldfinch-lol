import { render } from 'svelte/server';
import { describe, expect, it } from 'vitest';
import {
	CDRAGON_ORIGIN,
	DDRAGON_ORIGIN,
	championIconUrl,
	itemIconUrl,
	cdragonGameData,
	laneIconUrl,
	statShardIconUrl,
	profileIconUrl,
	runeIconUrl,
	summonerSpellIconUrl
} from '#lib/assets.ts';
import ChampionIcon from '#lib/components/ChampionIcon.svelte';

const CDN = 'https://ddragon.leagueoflegends.com/cdn/16.20.1/img';

describe('asset URLs', () => {
	it('builds Data Dragon image URLs keyed by patch', () => {
		expect(championIconUrl('16.20.1', 'MonkeyKing')).toBe(`${CDN}/champion/MonkeyKing.png`);
		expect(itemIconUrl('16.20.1', 3078)).toBe(`${CDN}/item/3078.png`);
		expect(profileIconUrl('16.20.1', 6)).toBe(`${CDN}/profileicon/6.png`);
		expect(summonerSpellIconUrl('16.20.1', 'SummonerFlash')).toBe(`${CDN}/spell/SummonerFlash.png`);
	});

	it('builds unversioned rune image URLs from runesReforged paths', () => {
		expect(runeIconUrl('perk-images/Styles/7201_Precision.png')).toBe(
			'https://ddragon.leagueoflegends.com/cdn/img/perk-images/Styles/7201_Precision.png'
		);
	});

	it('builds CommunityDragon lane icons pinned to major.minor, only for lanes', () => {
		expect(laneIconUrl('16.20.1', 'UTILITY')).toBe(
			'https://raw.communitydragon.org/16.20/plugins/rcp-fe-lol-clash/global/default/assets/images/position-selector/positions/icon-position-utility.png'
		);
		expect(laneIconUrl('16.20.1', '')).toBeUndefined();
		expect(laneIconUrl('16.20.1', 'Invalid')).toBeUndefined();
	});

	it('encodes path segments', () => {
		expect(championIconUrl('16.20.1', 'a/../b')).toBe(`${CDN}/champion/a%2F..%2Fb.png`);
	});
});

describe('CommunityDragon URLs', () => {
	it('pins game data to the major.minor patch, on a mirror if given', () => {
		expect(cdragonGameData('16.20.1')).toBe(
			'https://raw.communitydragon.org/16.20/plugins/rcp-be-lol-game-data/global/default/v1'
		);
		expect(cdragonGameData('16.20.1', 'http://mirror')).toBe(
			'http://mirror/16.20/plugins/rcp-be-lol-game-data/global/default/v1'
		);
	});

	it('builds a stat shard icon URL', () => {
		expect(statShardIconUrl('16.20.1', 'perk-images/statmods/statmodsattackspeedicon.png')).toBe(
			'https://raw.communitydragon.org/16.20/plugins/rcp-be-lol-game-data/global/default/v1/perk-images/statmods/statmodsattackspeedicon.png'
		);
	});
});

describe('ChampionIcon', () => {
	it('renders a sized, lazy image with the champion name as alt text', () => {
		const { body } = render(ChampionIcon, {
			props: { patch: '16.20.1', id: 'MonkeyKing', name: 'Wukong', size: 48 }
		});
		expect(body).toContain(`src="${CDN}/champion/MonkeyKing.png"`);
		expect(body).toContain('alt="Wukong"');
		expect(body).toContain('width="48"');
		expect(body).toContain('height="48"');
		expect(body).toContain('loading="lazy"');
		expect(body).toContain('decoding="async"');
		expect(body).not.toContain('fetchpriority="high"');
	});

	it("loads a page's main icon at once and first, with priority", () => {
		const { body } = render(ChampionIcon, {
			props: { patch: '16.20.1', id: 'Ahri', name: '', size: 64, priority: true }
		});
		expect(body).toContain('loading="eager"');
		expect(body).toContain('fetchpriority="high"');
		expect(body).toContain('width="64"');
	});
});

describe('image origins', () => {
	it('are the origins the icon URLs are built on, for preconnect', () => {
		expect(DDRAGON_ORIGIN).toBe('https://ddragon.leagueoflegends.com');
		expect(CDRAGON_ORIGIN).toBe('https://raw.communitydragon.org');
		expect(new URL(championIconUrl('16.20.1', 'Ahri')).origin).toBe(DDRAGON_ORIGIN);
		expect(new URL(laneIconUrl('16.20.1', 'MIDDLE') ?? '').origin).toBe(CDRAGON_ORIGIN);
		expect(new URL(statShardIconUrl('16.20.1', 'perk-images/x.png')).origin).toBe(CDRAGON_ORIGIN);
	});
});
