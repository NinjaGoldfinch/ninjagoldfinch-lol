import type { Named } from '#lib/api/ddragon.ts';
import { record } from '#lib/api/json.ts';
import { championPath } from './champion-search.ts';
import {
	sortRows,
	type ChampionFilter,
	type ChampionRow,
	type ChampionTable
} from './champion-stats.ts';
import { findRegion, type Region } from './regions.ts';
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

/** The region `?region=` names, without regard to case, or the default. */
export function pickRegion(params: URLSearchParams): Region {
	return findRegion(params.get('region') ?? '') ?? DEFAULT_REGION;
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
	id: number;
	/** The `en_US` title, else the first. */
	title: string;
	/** An incident's severity; null for a maintenance or an unknown value. */
	severity: StatusSeverity | null;
	/** A maintenance's `scheduled` or `in_progress`; null for an incident. */
	maintenanceStatus: string | null;
	updatedAt: string | null;
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

/** One status entry; none without an integer id or a title. */
function statusItem(value: unknown): StatusItem[] {
	const entry = record(value);
	const text = entry && title(entry.titles);
	if (!entry || !isInteger(entry.id) || text === undefined) return [];
	const severity = SEVERITIES.find((s) => s === entry.incident_severity) ?? null;
	return [
		{
			id: entry.id,
			title: text,
			severity,
			maintenanceStatus: stringOrNull(entry.maintenance_status),
			updatedAt: stringOrNull(entry.updated_at)
		}
	];
}

/**
 * A platform's status, read narrowly; undefined unless `maintenances` and
 * `incidents` are lists. Completed maintenances are dropped.
 */
export function parseStatus(body: unknown): PlatformStatus | undefined {
	const data = record(body);
	if (!data || !Array.isArray(data.maintenances) || !Array.isArray(data.incidents)) {
		return undefined;
	}
	return {
		name: stringOrNull(data.name),
		incidents: data.incidents.flatMap(statusItem),
		maintenances: data.maintenances
			.flatMap(statusItem)
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
