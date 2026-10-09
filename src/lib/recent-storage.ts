import { addRecent, parseRecent, type RecentSearch } from '#lib/domain/recent.ts';

// Browser only. Storage can be unavailable (private windows, blocked site
// data); recent searches are a convenience, so failures are ignored.

const KEY = 'recent-searches';

export function readRecent(): RecentSearch[] {
	try {
		return parseRecent(localStorage.getItem(KEY));
	} catch {
		return [];
	}
}

export function rememberSearch(entry: RecentSearch): void {
	try {
		localStorage.setItem(KEY, JSON.stringify(addRecent(readRecent(), entry)));
	} catch {
		// ignore
	}
}
