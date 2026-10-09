// See https://svelte.dev/docs/kit/types#app.d.ts
// for information about these interfaces
declare global {
	namespace App {
		interface Error {
			/** Seconds to wait before retrying, when riot-proxy says. */
			retryAfter?: number;
		}
		// interface Locals {}
		// interface PageData {}
		interface PageState {
			/**
			 * The match page's open build popup, by participant id; null once closed.
			 * Absent until the visitor opens or closes one (ADR-028).
			 */
			build?: number | null;
		}
		// interface Platform {}
	}
}

export {};
