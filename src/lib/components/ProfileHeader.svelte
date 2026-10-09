<script lang="ts">
	import { enhance } from '$app/forms';
	import type { Summoner } from '#lib/api/riot.ts';
	import { profileIconUrl } from '#lib/assets.ts';
	import { formatAge } from '#lib/domain/age.ts';
	import type { RiotId } from '#lib/domain/riot-id.ts';

	let {
		riotId,
		regionLabel,
		summoner,
		patch,
		ageSeconds,
		refreshAvailableIn,
		refreshAction = '?/refresh'
	}: {
		riotId: RiotId;
		regionLabel: string;
		summoner: Summoner | null;
		patch: string;
		ageSeconds: number | null;
		refreshAvailableIn: number;
		/** The refresh action's URL, keeping the page's filter. */
		refreshAction?: string;
	} = $props();

	// Counts the cooldown down in the browser; the server renders the starting value.
	let elapsed = $state(0);
	const remaining = $derived(Math.max(0, refreshAvailableIn - elapsed));

	$effect(() => {
		const total = refreshAvailableIn;
		elapsed = 0;
		if (total <= 0) return;
		const timer = setInterval(() => {
			elapsed += 1;
			if (elapsed >= total) clearInterval(timer);
		}, 1000);
		return () => clearInterval(timer);
	});
</script>

<header class="flex flex-wrap items-center gap-4">
	{#if summoner}
		<img
			src={profileIconUrl(patch, summoner.profileIconId)}
			alt=""
			width="64"
			height="64"
			class="rounded-lg bg-surface"
		/>
	{/if}
	<div class="min-w-0 flex-1">
		<h1 class="text-2xl font-semibold">
			{riotId.gameName}<span class="text-muted">#{riotId.tagLine}</span>
		</h1>
		<p class="mt-1 text-sm text-muted">
			{[regionLabel, summoner && `Level ${summoner.summonerLevel}`].filter(Boolean).join(' · ')}
		</p>
	</div>
	<div class="flex flex-col items-end gap-1 text-sm">
		<!-- POST, so crawlers never spend Riot quota; works without JavaScript. -->
		<form
			method="POST"
			action={refreshAction}
			use:enhance={() =>
				({ update }) =>
					update({ invalidateAll: false })}
		>
			<button
				type="submit"
				disabled={remaining > 0}
				class="h-9 rounded border border-border bg-surface px-4 font-medium hover:border-accent disabled:cursor-not-allowed disabled:opacity-50"
			>
				Refresh
			</button>
		</form>
		<p class="text-xs text-muted">
			{#if remaining > 0}
				Refresh available in {remaining}s
			{:else if ageSeconds !== null}
				Updated {formatAge(ageSeconds)}
			{/if}
		</p>
	</div>
</header>
