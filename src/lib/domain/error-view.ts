/** What the error page says for each of the three proxy failure states. */
export interface ErrorView {
	title: string;
	detail: string;
}

export function describeError(status: number, retryAfter?: number): ErrorView {
	if (status === 404) {
		return {
			title: 'Not found',
			detail: 'Nothing matches that. Check the spelling and the #TAG.'
		};
	}

	if (status === 429) {
		const wait = retryAfter === undefined ? 'a minute' : formatWait(retryAfter);
		return { title: 'Too many requests', detail: `Riot's API is busy. Try again in ${wait}.` };
	}

	return {
		title: 'Temporarily unavailable',
		detail: 'Player data cannot be loaded right now. Try again shortly.'
	};
}

function formatWait(wait: number): string {
	// riot-proxy's retryAfter can be fractional; never promise less than it says.
	const seconds = Math.ceil(wait);
	if (seconds <= 1) return '1 second';
	if (seconds < 60) return `${seconds} seconds`;
	const minutes = Math.ceil(seconds / 60);
	return minutes === 1 ? '1 minute' : `${minutes} minutes`;
}
