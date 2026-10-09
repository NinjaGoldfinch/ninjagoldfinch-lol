import { describe, expect, it } from 'vitest';
import type { components } from '#lib/api/schema.d.ts';
import {
	csPerMinute,
	formatDuration,
	isCustomGame,
	itemSlots,
	kdaRatio,
	patchOf,
	toMatchRows
} from '#lib/domain/matches.ts';
import { MATCHES_PATH, fixtureBody, recordedNames } from './fixtures.ts';

type MatchSummary = components['schemas']['MatchSummary'];
const { matches } = fixtureBody(MATCHES_PATH) as { matches: MatchSummary[] };
const names = recordedNames();
// Two hours after the first recorded game started.
const now = 1791519114644 + 2 * 3600 * 1000;

describe('toMatchRows', () => {
	it('shapes every recorded match, with names from Data Dragon', () => {
		const rows = toMatchRows(matches, names, now);
		expect(rows).toHaveLength(10);
		expect(rows[0]).toEqual({
			matchId: 'OC1_712351051',
			queueId: 420,
			queue: 'Ranked Solo',
			playedAgo: '2 hours ago',
			duration: 1952,
			patch: '16.20',
			ddragonVersion: '16.20.1',
			result: 'win',
			champion: { id: 103, key: 'Ahri', name: 'Ahri', level: 16 },
			kills: 8,
			deaths: 8,
			assists: 10,
			cs: 181,
			items: [
				{ id: 1056, name: "Doran's Ring" },
				{ id: 2503, name: names.items[2503] },
				{ id: 3100, name: names.items[3100] },
				{ id: 3171, name: names.items[3171] },
				{ id: 8010, name: names.items[8010] },
				{ id: 1052, name: names.items[1052] },
				{ id: 3363, name: names.items[3363] }
			],
			spells: [
				{ id: 'SummonerDot', name: 'Ignite' },
				{ id: 'SummonerFlash', name: 'Flash' }
			],
			runes: {
				keystone: names.runes[8992],
				secondary: { name: 'Precision', icon: 'perk-images/Styles/7201_Precision.png' }
			},
			position: 'MIDDLE'
		});
	});

	it('marks an early surrender as a remake, not a loss', () => {
		const p = matches[0].player;
		const remake = { ...matches[0], player: { ...p, win: false, gameEndedInEarlySurrender: true } };
		expect(toMatchRows([remake], names, now)[0].result).toBe('remake');
	});

	it('keeps rendering when the patch data lacks something', () => {
		const p = matches[0].player;
		const unknown = {
			...matches[0],
			queueId: 9999,
			player: { ...p, championId: 99999, championName: 'Newchamp', item0: 999999, item1: 0 }
		};
		const row = toMatchRows([unknown], names, now)[0];
		expect(row.queue).toBe('Queue 9999');
		expect(row.champion).toMatchObject({ key: null, name: 'Newchamp' });
		expect(row.items.slice(0, 2)).toEqual([{ id: 999999, name: 'Item 999999' }, null]);
	});

	it('leaves runes empty when the match or the patch lacks them', () => {
		const p = matches[0].player;
		const noPerks = { ...matches[0], player: { ...p, perks: null } };
		expect(toMatchRows([noPerks], names, now)[0].runes).toEqual({
			keystone: null,
			secondary: null
		});
		const unknown = { ...matches[0], player: { ...p, perks: { keystone: 1, subStyle: 2 } } };
		expect(toMatchRows([unknown], names, now)[0].runes).toEqual({
			keystone: null,
			secondary: null
		});
	});

	it('keeps the role quest slot for bot laners, where their boots go', () => {
		const p = { ...matches[0].player, teamPosition: 'BOTTOM', roleBoundItem: 3047 };
		expect(toMatchRows([{ ...matches[0], player: p }], names, now)[0].roleBoundItem).toEqual({
			id: 3047,
			name: 'Plated Steelcaps'
		});
	});

	it('drops the role quest slot for every other role', () => {
		// The recorded first game is a mid laner's, with a Mid Lane Quest Reward.
		expect(matches[0].player?.roleBoundItem).toBe(1206);
		for (const teamPosition of ['TOP', 'JUNGLE', 'MIDDLE', 'UTILITY', '']) {
			const p = { ...matches[0].player, teamPosition };
			expect(toMatchRows([{ ...matches[0], player: p }], names, now)[0]).not.toHaveProperty(
				'roleBoundItem'
			);
		}
	});

	it('keeps "empty" apart from "not recorded" for the role quest slot', () => {
		const p = { ...matches[0].player, teamPosition: 'BOTTOM' };
		const empty = { ...matches[0], player: { ...p, roleBoundItem: 0 } };
		expect(toMatchRows([empty], names, now)[0].roleBoundItem).toBeNull();

		const older = { ...matches[0], player: { ...p, roleBoundItem: undefined } };
		expect(toMatchRows([older], names, now)[0]).not.toHaveProperty('roleBoundItem');
	});

	it('leaves ddragonVersion null when riot-proxy has none for the patch', () => {
		const unknown = { ...matches[0], ddragonVersion: undefined };
		expect(toMatchRows([unknown], names, now)[0].ddragonVersion).toBeNull();
	});

	it("drops summaries without the player's line or champion", () => {
		expect(toMatchRows([{ matchId: 'OC1_1', player: null }], names, now)).toEqual([]);
		expect(toMatchRows([{ matchId: 'OC1_2', player: { win: true } }], names, now)).toEqual([]);
	});
});

describe('match formatting', () => {
	it('takes major.minor from a game build', () => {
		expect(patchOf('16.20.824.8524')).toBe('16.20');
		expect(patchOf(null)).toBeNull();
		expect(patchOf('junk')).toBeNull();
	});

	it('formats durations', () => {
		expect(formatDuration(1952)).toBe('32:32');
		expect(formatDuration(65)).toBe('1:05');
		expect(formatDuration(3725)).toBe('1:02:05');
	});

	it('gives a KDA ratio, or Perfect with no deaths', () => {
		expect(kdaRatio(8, 8, 10)).toBe('2.25');
		expect(kdaRatio(3, 0, 4)).toBe('Perfect');
	});

	it('gives CS per minute', () => {
		expect(csPerMinute(181, 1952)).toBe('5.6');
		expect(csPerMinute(0, 0)).toBe('0.0');
	});
});

describe('isCustomGame', () => {
	it('treats queue 0 and a missing queue as custom', () => {
		expect(isCustomGame({ matchId: 'a', queueId: 0 })).toBe(true);
		expect(isCustomGame({ matchId: 'b', queueId: null })).toBe(true);
		expect(isCustomGame({ matchId: 'c' })).toBe(true);
		expect(isCustomGame({ matchId: 'd', queueId: 420 })).toBe(false);
	});
});

describe('itemSlots', () => {
	const item = (id: number) => ({ id, name: `Item ${id}` });
	const held = (id: number, roleQuest = false) => ({ ...item(id), roleQuest });

	it('packs items left, with the trinket and role quest item before the empty slots', () => {
		const items = [item(1), null, item(2), null, null, null, item(3340)];
		expect(itemSlots({ items, roleBoundItem: item(3006) })).toEqual([
			held(1),
			held(2),
			held(3340),
			held(3006, true),
			null,
			null,
			null,
			null
		]);
	});

	it('keeps eight slots when the role quest slot is empty', () => {
		const items = [item(1), item(2), item(3), item(4), item(5), item(6), item(3340)];
		const slots = itemSlots({ items, roleBoundItem: null });
		expect(slots).toHaveLength(8);
		expect(slots.at(-1)).toBeNull();
	});

	it('draws seven slots for a game that predates role quests', () => {
		const items = [null, item(1), null, null, null, null, null];
		expect(itemSlots({ items })).toEqual([held(1), null, null, null, null, null, null]);
	});

	it('packs the recorded game that sold an item mid-build', () => {
		const rows = toMatchRows(matches, names, now);
		const gapped = rows.find((r) => r.items[4] === null && r.items[5] !== null);
		expect(gapped).toBeDefined();
		const slots = gapped ? itemSlots(gapped) : [];
		// A jungler: no role quest slot, so seven slots with the gap last.
		expect(slots).toHaveLength(7);
		expect(slots.slice(0, 6).every(Boolean)).toBe(true);
		expect(slots.at(-1)).toBeNull();
	});
});
