import { record } from '#lib/api/json.ts';
import { championPath } from './champion-search.ts';
import {
	ROLES,
	filterFields,
	parseChampionFilter,
	patchLabel,
	queryString,
	rankLabel,
	sortRows,
	type ChampionFilter,
	type ChampionRow,
	type ChampionSort,
	type ChampionTable
} from './champion-stats.ts';
import { REGIONS, findRegion, type Region } from './regions.ts';
import { profilePath } from './riot-id.ts';

// The front page's cards (ADR-066): shaped here, loaded by
// src/lib/server/front-page.ts.

/**
 * The top-win-rate card's default slice, and the games-analysed pill's only
 * one: Ranked Solo, every role, tier, region and patch, whatever `/champions`'
 * default patch (ADR-033, ADR-077).
 */
export const FRONT_FILTER: ChampionFilter = { role: null, patch: 'all', rank: null };

/** The card's default order. `/champions` defaults to pick rate; the card leads with win rate. */
export const FRONT_SORT: ChampionSort = 'win';

/** What the top-win-rate card shows: a slice of riot-proxy's analytics, and an order (ADR-077). */
export interface FrontCard {
	/** `patch` is `all`, or null for riot-proxy's newest patch: the card offers no other. */
	filter: ChampionFilter;
	sort: ChampionSort;
}

export const FRONT_CARD: FrontCard = { filter: FRONT_FILTER, sort: FRONT_SORT };

/**
 * The card's view from the query, in `/champions`' words (`role`, `rank`,
 * `patch`, `sort`), so its link to `/champions` carries it. A patch other
 * than `newest` is every patch, whatever `/champions`' default; a sort other
 * than `pick` or `ban` is win rate.
 */
export function parseFrontCard(params: URLSearchParams): FrontCard {
	const { role, rank } = parseChampionFilter(params);
	const sort = params.get('sort');
	return {
		filter: { role, rank, patch: params.get('patch') === 'newest' ? null : 'all' },
		sort: sort === 'pick' || sort === 'ban' ? sort : FRONT_SORT
	};
}

/** Whether a filter is the default slice, so the card's call is the pill's too. */
export function isFrontFilter(filter: ChampionFilter): boolean {
	return filter.role === null && filter.rank === null && filter.patch === FRONT_FILTER.patch;
}

/**
 * The card's fields in a URL, defaults left out: a form's hidden inputs keep
 * the view. `patch=newest` for this patch, and no field for all patches,
 * whatever `/champions` leaves out.
 */
export function cardFields(card: FrontCard): [string, string][] {
	const fields = filterFields(card.filter).filter(([key]) => key !== 'patch');
	if (card.filter.patch === null) fields.push(['patch', 'newest']);
	if (card.sort !== FRONT_SORT) fields.push(['sort', card.sort]);
	return fields;
}

/**
 * Games a champion needs to be on the card, highest first. The card takes
 * the first that six champions reach, so the default slice keeps 800, and a
 * narrow one (a new patch, a role, a tier) still fills; it never goes under
 * 100, where `/champions` marks a rate as a low sample (ADR-035, ADR-077).
 * Applied here, not on the wire: riot-proxy is still asked for every row.
 */
export const GAMES_FLOORS = [800, 400, 200, 100] as const;

/** The default slice's floor, the highest. */
export const TOP_WIN_RATE_MIN_GAMES = GAMES_FLOORS[0];

/** How many champions the card lists. */
export const TOP_WIN_RATE_COUNT = 6;

/** The highest of `GAMES_FLOORS` that `count` champions reach; else the lowest. */
export function gamesFloor(rows: ChampionRow[], count = TOP_WIN_RATE_COUNT): number {
	const reached = GAMES_FLOORS.find((f) => rows.filter((r) => r.games >= f).length >= count);
	return reached ?? GAMES_FLOORS[GAMES_FLOORS.length - 1];
}

/** The card's rows and the floor they were picked over. */
export interface TopChampions {
	/** The patch the rows are for: `all`, or riot-proxy's newest by number. */
	patch: string | null;
	minGames: number;
	rows: ChampionRow[];
}

/** Highest first by the card's sort, over the floor; ties by games, then name (`sortRows`). */
export function topChampions(
	table: ChampionTable,
	sort: ChampionSort = FRONT_SORT,
	count = TOP_WIN_RATE_COUNT
): TopChampions {
	const minGames = gamesFloor(table.rows, count);
	return {
		patch: table.patch,
		minGames,
		rows: sortRows(
			table.rows.filter((row) => row.games >= minGames),
			sort
		).slice(0, count)
	};
}

/** The card's heading for its sort. */
export function cardHeading(sort: ChampionSort): string {
	return { win: 'Top win rate', pick: 'Top pick rate', ban: 'Top ban rate' }[sort];
}

/** `Patch 16.20 · Mid · Diamond+`: what the rows count, in the card's words. */
export function cardScope(filter: ChampionFilter, patch: string | null): string {
	const role = ROLES.find((r) => r.slug === filter.role)?.label;
	return [
		patchLabel(patch ?? filter.patch),
		...(role ? [role] : []),
		...(filter.rank ? [rankLabel(filter.rank)] : [])
	].join(' · ');
}

/**
 * A row's bar, in whole percent. Win rates on a fixed scale (`winRateBar`);
 * pick and ban rates against the card's highest, which fills its bar.
 */
export function rateBar(row: ChampionRow, sort: ChampionSort, rows: ChampionRow[]): number {
	if (sort === 'win') return winRateBar(row.winRate);
	const rate = (r: ChampionRow) => (sort === 'pick' ? r.pickRate : r.banRate) ?? 0;
	const top = Math.max(0, ...rows.map(rate));
	return top > 0 ? Math.round((rate(row) / top) * 100) : 0;
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

/**
 * The canonical query for a region and the card: `` for the defaults,
 * `?region=kr&role=mid&rank=diamond+&patch=newest&sort=pick` at most.
 */
export function frontQuery(region: { slug: string }, card: FrontCard = FRONT_CARD): string {
	return queryString([...regionFields(region), ...cardFields(card)]);
}

/** The region's field in a URL, the default left out: the card's forms keep it. */
export function regionFields(region: { slug: string }): [string, string][] {
	return region.slug === DEFAULT_REGION_SLUG ? [] : [['region', region.slug]];
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
	/** A maintenance's state as Riot wrote it (`complete` ones are dropped); null when missing or not a string, as for an incident. Anything but `scheduled` ranks as a warning (ADR-078). */
	maintenanceStatus: string | null;
	/** When Riot opened the entry (`created_at`), as it wrote it. */
	createdAt: string | null;
	updatedAt: string | null;
	/** The newest published update's text, in English when it has it; null without one (ADR-075, ADR-078). */
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
 * The text of an entry's newest update (ADR-078): the one posted last, by
 * `created_at`, else `updated_at`, so an edit to an older update does not
 * outrank a newer one. One without a readable time counts as the oldest; of
 * equals the first wins. Unpublished updates, and those without text, are skipped.
 */
function latestUpdate(updates: unknown): string | null {
	if (!Array.isArray(updates)) return null;
	let newest: { text: string; at: number } | undefined;
	for (const value of updates) {
		const update = record(value);
		if (!update || update.publish === false) continue;
		const text = localised(update.translations)?.trim();
		if (!text) continue;
		const at = timeOf(update.created_at) ?? timeOf(update.updated_at) ?? -Infinity;
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
 * is a `warning`, as is a maintenance under way or whose state is unreadable:
 * open, neither may read as less than it may be (ADR-072, ADR-078). Only a
 * `scheduled` maintenance is `maintenance`, after the `info` incidents.
 */
export const STATUS_ORDER: readonly StatusTone[] = ['critical', 'warning', 'info', 'maintenance'];

function incidentTone(item: StatusItem): StatusTone {
	return item.severity ?? 'warning';
}

function maintenanceTone(item: StatusItem): StatusTone {
	return item.maintenanceStatus === 'scheduled' ? 'maintenance' : 'warning';
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
