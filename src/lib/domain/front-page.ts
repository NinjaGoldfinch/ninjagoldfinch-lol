import type { Named } from '#lib/api/ddragon.ts';
import { record } from '#lib/api/json.ts';
import { championPath } from './champion-search.ts';
import {
	sortRows,
	type ChampionFilter,
	type ChampionRow,
	type ChampionTable
} from './champion-stats.ts';
import { REGIONS, findRegion, type Region } from './regions.ts';
import { profilePath } from './riot-id.ts';

// The front page's cards (ADR-066): shaped here, loaded by
// src/lib/server/front-page.ts.

/** The top-win-rate card's rows: Ranked Solo, every role, tier, region and patch, as `/champions`. */
export const FRONT_FILTER: ChampionFilter = { role: null, patch: 'all', rank: null };

/**
 * Games a champion needs before its win rate can lead the front page. Applied
 * here, not on the wire: riot-proxy is still asked for every row (ADR-035).
 */
export const TOP_WIN_RATE_MIN_GAMES = 800;

/** How many champions the card lists. */
export const TOP_WIN_RATE_COUNT = 6;

/** Highest win rate first, over the floor; ties by games, then name (`sortRows`). */
export function topWinRates(
	table: ChampionTable,
	minGames = TOP_WIN_RATE_MIN_GAMES,
	count = TOP_WIN_RATE_COUNT
): ChampionRow[] {
	return sortRows(
		table.rows.filter((row) => row.games >= minGames),
		'win'
	).slice(0, count);
}

/** The bar behind a win rate, in whole percent: 0 at `lo` (45 %), 100 at `hi` (60 %), clamped. */
export function winRateBar(winRate: number, lo = 0.45, hi = 0.6): number {
	const share = (winRate - lo) / (hi - lo);
	return Math.round(Math.min(1, Math.max(0, share)) * 100);
}

/** A count with thousands separators: `211,590`. */
export function formatCount(n: number): string {
	return n.toLocaleString('en-US');
}

/** Example searches under the hero form: two champions and a player. */
export const EXAMPLE_SEARCHES: readonly { label: string; href: string }[] = [
	{ label: 'Ahri', href: championPath({ id: 'Ahri', name: 'Ahri' }) },
	{ label: 'Jinx', href: championPath({ id: 'Jinx', name: 'Jinx' }) },
	{
		label: 'NinjaGoldfinch#OCENZ',
		href: profilePath({ gameName: 'NinjaGoldfinch', tagLine: 'OCENZ' })
	}
];

/** The region the rotation and status cards show when the URL names none (ADR-071). */
export const DEFAULT_REGION_SLUG = 'oce';

function defaultRegion(): Region {
	const region = findRegion(DEFAULT_REGION_SLUG);
	if (!region) throw new Error(`no region ${DEFAULT_REGION_SLUG}`);
	return region;
}

/** Oceania: the owner's platform, and the fixtures'. */
export const DEFAULT_REGION: Region = defaultRegion();

/**
 * The regions the rotation and status cards offer: every region but the
 * Middle East. Its platform, `me1`, is not in riot-proxy 2.10.0's platform
 * list, which answers 400 for it; it comes back when a riot-proxy release
 * accepts `me1` (ADR-072). Profiles still use the whole of `REGIONS`.
 */
export const FRONT_REGIONS: readonly Region[] = REGIONS.filter((region) => region.slug !== 'me');

/** The region `?region=` names, without regard to case, if the front page offers it; else the default. */
export function pickRegion(params: URLSearchParams): Region {
	const region = findRegion(params.get('region') ?? '');
	return region && FRONT_REGIONS.includes(region) ? region : DEFAULT_REGION;
}

/** The canonical query for a region: `` for the default, `?region=kr` otherwise. */
export function frontQuery(region: Region): string {
	return region.slug === DEFAULT_REGION_SLUG ? '' : `?region=${region.slug}`;
}

/**
 * What the site reads of Riot's champion-v3 `ChampionInfo`, which riot-proxy
 * passes through without a schema (ADR-071).
 */
export interface Rotation {
	free: number[];
	forNewPlayers: number[];
	maxNewPlayerLevel: number | null;
}

const isInteger = (value: unknown): value is number =>
	typeof value === 'number' && Number.isInteger(value);

/** Integer entries of a list; anything else is dropped. */
function integers(value: unknown): number[] {
	return Array.isArray(value) ? value.filter(isInteger) : [];
}

/** A champion-v3 rotation, read narrowly; undefined when `freeChampionIds` is not a list. */
export function parseRotation(body: unknown): Rotation | undefined {
	const info = record(body);
	if (!info || !Array.isArray(info.freeChampionIds)) return undefined;
	return {
		free: integers(info.freeChampionIds),
		forNewPlayers: integers(info.freeChampionIdsForNewPlayers),
		maxNewPlayerLevel: isInteger(info.maxNewPlayerLevel) ? info.maxNewPlayerLevel : null
	};
}

/** A free champion, named for its icon and link. */
export interface RotationChampion {
	id: number;
	/** Data Dragon id: `MasterYi`. */
	key: string;
	name: string;
}

/** The free champions the lookups know, by name; ids the lookups lack are left out. */
export function rotationChampions(
	rotation: Rotation,
	champions: Record<number, Named>
): RotationChampion[] {
	return rotation.free
		.flatMap((id) => {
			const named = champions[id];
			return named ? [{ id, key: named.id, name: named.name }] : [];
		})
		.toSorted((a, b) => a.name.localeCompare(b.name));
}

export type StatusSeverity = 'info' | 'warning' | 'critical';

const SEVERITIES: readonly StatusSeverity[] = ['info', 'warning', 'critical'];

/** An incident or a maintenance from lol-status-v4. */
export interface StatusItem {
	/** Riot's id; null when the entry had no integer id. */
	id: number | null;
	/** For a keyed list: `id-9101`, or `at-2`, the entry's place in its list, when it has no id. */
	key: string;
	/** The `en_US` title, else the first; `Incident` or `Maintenance` when it has none. */
	title: string;
	/** An incident's severity; null for a maintenance or an unknown value. */
	severity: StatusSeverity | null;
	/** A maintenance's `scheduled` or `in_progress`; null for an incident. */
	maintenanceStatus: string | null;
	updatedAt: string | null;
	/** What the entry lacked and was filled in for it; empty when it was whole. */
	missing: ('id' | 'title')[];
}

/** What the site reads of lol-status-v4's `PlatformDataDto` (ADR-071). */
export interface PlatformStatus {
	name: string | null;
	incidents: StatusItem[];
	maintenances: StatusItem[];
}

/** The `en_US` title's content, else the first title with any. */
function title(titles: unknown): string | undefined {
	if (!Array.isArray(titles)) return undefined;
	const named = titles.flatMap((t) => {
		const entry = record(t);
		return entry && typeof entry.content === 'string' && entry.content !== ''
			? [{ locale: entry.locale, content: entry.content }]
			: [];
	});
	return (named.find((t) => t.locale === 'en_US') ?? named[0])?.content;
}

const stringOrNull = (value: unknown): string | null => (typeof value === 'string' ? value : null);

/**
 * One status entry, whatever it lacks (ADR-072): an entry without an integer
 * id is keyed by its place in the list, and one without a title is called
 * `fallback`, so that something open is never read as all clear.
 */
function statusItem(fallback: 'Incident' | 'Maintenance') {
	return (value: unknown, index: number): StatusItem => {
		const entry = record(value) ?? {};
		const id = isInteger(entry.id) ? entry.id : null;
		const text = title(entry.titles);
		return {
			id,
			key: id === null ? `at-${index}` : `id-${id}`,
			title: text ?? fallback,
			severity: SEVERITIES.find((s) => s === entry.incident_severity) ?? null,
			maintenanceStatus: stringOrNull(entry.maintenance_status),
			updatedAt: stringOrNull(entry.updated_at),
			missing: [
				...(id === null ? ['id' as const] : []),
				...(text === undefined ? ['title' as const] : [])
			]
		};
	};
}

/**
 * A platform's status, read narrowly; undefined unless `maintenances` and
 * `incidents` are lists. Every entry is kept but completed maintenances.
 */
export function parseStatus(body: unknown): PlatformStatus | undefined {
	const data = record(body);
	if (!data || !Array.isArray(data.maintenances) || !Array.isArray(data.incidents)) {
		return undefined;
	}
	return {
		name: stringOrNull(data.name),
		incidents: data.incidents.map(statusItem('Incident')),
		maintenances: data.maintenances
			.map(statusItem('Maintenance'))
			.filter((m) => m.maintenanceStatus !== 'complete')
	};
}

/** Nothing open on the platform: the green state. */
export function allRunning(status: PlatformStatus): boolean {
	return status.incidents.length === 0 && status.maintenances.length === 0;
}

/** riot-proxy's `X-Cache-Fetched-Age` in seconds; null when absent or not a non-negative integer. */
export function fetchedAge(header: string | null): number | null {
	return header !== null && /^\d+$/.test(header) ? Number(header) : null;
}
