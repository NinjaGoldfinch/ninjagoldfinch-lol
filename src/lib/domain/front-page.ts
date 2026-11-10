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

/** Players in a Summoner's Rift game: five a side. */
export const PLAYERS_PER_GAME = 10;

/**
 * Games behind riot-proxy's `totalGames`, which counts participant games:
 * each game once for every champion in it. Over every role, tier and side of
 * a ranked queue that is ten a game (ADR-074). Rounded down.
 */
export function gamesAnalysed(participantGames: number): number {
	return Math.floor(participantGames / PLAYERS_PER_GAME);
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

/** The region the status card shows when the URL names none (ADR-071). */
export const DEFAULT_REGION_SLUG = 'oce';

function defaultRegion(): Region {
	const region = findRegion(DEFAULT_REGION_SLUG);
	if (!region) throw new Error(`no region ${DEFAULT_REGION_SLUG}`);
	return region;
}

/** Oceania: the owner's platform, and the fixtures'. */
export const DEFAULT_REGION: Region = defaultRegion();

/**
 * The regions the status card offers: every region but the
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

const isInteger = (value: unknown): value is number =>
	typeof value === 'number' && Number.isInteger(value);

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
	/** When Riot opened the entry (`created_at`), as it wrote it. */
	createdAt: string | null;
	updatedAt: string | null;
	/** The newest published update's text, in English when it has it; null without one (ADR-075). */
	update: string | null;
	/** What the entry lacked and was filled in for it; empty when it was whole. */
	missing: ('id' | 'title')[];
}

/** What the site reads of lol-status-v4's `PlatformDataDto` (ADR-071). */
export interface PlatformStatus {
	name: string | null;
	incidents: StatusItem[];
	maintenances: StatusItem[];
}

/** The `en_US` entry's content of a list of `{ locale, content }`, else the first with any. */
function localised(texts: unknown): string | undefined {
	if (!Array.isArray(texts)) return undefined;
	const named = texts.flatMap((t) => {
		const entry = record(t);
		return entry && typeof entry.content === 'string' && entry.content !== ''
			? [{ locale: entry.locale, content: entry.content }]
			: [];
	});
	return (named.find((t) => t.locale === 'en_US') ?? named[0])?.content;
}

/** An RFC 3339 time in ms since the epoch; null when it is not a string or not a time. */
function timeOf(value: unknown): number | null {
	if (typeof value !== 'string') return null;
	const ms = Date.parse(value);
	return Number.isNaN(ms) ? null : ms;
}

/**
 * The text of an entry's newest update (ADR-075): by `updated_at`, else
 * `created_at`; one without a readable time counts as the oldest, and of
 * equals the first in the list wins. Updates marked `publish: false`, and
 * those without text, are passed over.
 */
function latestUpdate(updates: unknown): string | null {
	if (!Array.isArray(updates)) return null;
	let newest: { text: string; at: number } | undefined;
	for (const value of updates) {
		const update = record(value);
		if (!update || update.publish === false) continue;
		const text = localised(update.translations)?.trim();
		if (!text) continue;
		const at = timeOf(update.updated_at) ?? timeOf(update.created_at) ?? -Infinity;
		if (!newest || at > newest.at) newest = { text, at };
	}
	return newest?.text ?? null;
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
		const text = localised(entry.titles);
		return {
			id,
			key: id === null ? `at-${index}` : `id-${id}`,
			title: text ?? fallback,
			severity: SEVERITIES.find((s) => s === entry.incident_severity) ?? null,
			maintenanceStatus: stringOrNull(entry.maintenance_status),
			createdAt: stringOrNull(entry.created_at),
			updatedAt: stringOrNull(entry.updated_at),
			update: latestUpdate(entry.updates),
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

/** How an open entry is marked and ordered (`STATUS_ORDER`). */
export type StatusTone = 'critical' | 'warning' | 'maintenance' | 'info';

/** An open incident or maintenance as the status card shows it (ADR-075). */
export interface StatusEntry {
	/** Unique in the card: `Incident-id-9101`. */
	key: string;
	kind: 'Incident' | 'Maintenance';
	title: string;
	/** `warning`, `in progress`, `scheduled`: the severity or the maintenance's state; null when unreadable. */
	state: string | null;
	tone: StatusTone;
	/** The newest update's text; null without one. */
	update: string | null;
	/** `updated` or `opened`, and how many seconds ago, from `updated_at`, else `created_at`; null when neither is a time. */
	age: { event: 'updated' | 'opened'; seconds: number } | null;
}

/** A platform's status as the card shows it. */
export interface StatusView {
	incidents: number;
	maintenances: number;
	/** Every open entry, worst first (`STATUS_ORDER`); within a tone, in the feed's order. */
	entries: StatusEntry[];
}

/**
 * The order of the card's entries. An incident whose severity is unreadable
 * is a `warning`: it is open, and must not read as less than it may be
 * (ADR-072). A maintenance under way is a `warning` too; any other is
 * `maintenance`, after the `info` incidents, which are about now.
 */
export const STATUS_ORDER: readonly StatusTone[] = ['critical', 'warning', 'info', 'maintenance'];

function incidentTone(item: StatusItem): StatusTone {
	return item.severity ?? 'warning';
}

function maintenanceTone(item: StatusItem): StatusTone {
	return item.maintenanceStatus === 'in_progress' ? 'warning' : 'maintenance';
}

function statusEntry(kind: StatusEntry['kind'], item: StatusItem, now: number): StatusEntry {
	const state = kind === 'Incident' ? item.severity : item.maintenanceStatus;
	const updated = timeOf(item.updatedAt);
	const at = updated ?? timeOf(item.createdAt);
	return {
		key: `${kind}-${item.key}`,
		kind,
		title: item.title,
		state: state ? state.replaceAll('_', ' ') : null,
		tone: kind === 'Incident' ? incidentTone(item) : maintenanceTone(item),
		update: item.update,
		age:
			at === null
				? null
				: {
						event: updated === null ? 'opened' : 'updated',
						seconds: Math.max(0, Math.floor((now - at) / 1000))
					}
	};
}

/** The card's view of a platform's status at `now` (ms): counts, and every open entry, worst first. */
export function statusView(status: PlatformStatus, now: number): StatusView {
	const entries = [
		...status.incidents.map((item) => statusEntry('Incident', item, now)),
		...status.maintenances.map((item) => statusEntry('Maintenance', item, now))
	];
	return {
		incidents: status.incidents.length,
		maintenances: status.maintenances.length,
		entries: STATUS_ORDER.flatMap((tone) => entries.filter((entry) => entry.tone === tone))
	};
}

/** Nothing open on the platform: the green state. */
export function allRunning(status: StatusView): boolean {
	return status.entries.length === 0;
}

/** The card's first line: `All services running`, or `2 incidents · 1 maintenance`. */
export function statusHeadline(status: StatusView): string {
	if (allRunning(status)) return 'All services running';
	const count = (n: number, one: string, many: string) =>
		n === 0 ? [] : [`${n} ${n === 1 ? one : many}`];
	return [
		...count(status.incidents, 'incident', 'incidents'),
		...count(status.maintenances, 'maintenance', 'maintenances')
	].join(' · ');
}

/**
 * Riot's own status page for a platform, which the card links to for the
 * whole of each entry. Seen answering for `oc1` and `kr` on 2026-11-10.
 */
export function riotStatusUrl(platform: string): string {
	return `https://status.riotgames.com/lol?region=${encodeURIComponent(platform)}&locale=en_US`;
}

/** riot-proxy's `X-Cache-Fetched-Age` in seconds; null when absent or not a non-negative integer. */
export function fetchedAge(header: string | null): number | null {
	return header !== null && /^\d+$/.test(header) ? Number(header) : null;
}
