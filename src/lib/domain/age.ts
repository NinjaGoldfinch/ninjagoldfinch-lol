/** How old data is, in words: `just now`, `3 minutes ago`, `2 hours ago`, `5 days ago`. */
export function formatAge(seconds: number): string {
	if (seconds < 60) return 'just now';
	if (seconds < 3600) return plural(Math.floor(seconds / 60), 'minute');
	if (seconds < 86400) return plural(Math.floor(seconds / 3600), 'hour');
	return plural(Math.floor(seconds / 86400), 'day');
}

function plural(n: number, unit: string): string {
	return `${n} ${unit}${n === 1 ? '' : 's'} ago`;
}

/** How long ago a moment was, in words, from ms timestamps; a moment ahead of `now` is `just now`. */
export function ageSince(then: number, now: number): string {
	return formatAge(Math.max(0, Math.floor((now - then) / 1000)));
}
