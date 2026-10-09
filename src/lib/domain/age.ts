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
