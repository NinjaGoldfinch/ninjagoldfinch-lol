<script lang="ts">
	import { PUBLIC_SITE_NAME } from '$app/env/public';
	import RecentSearches from '#lib/components/RecentSearches.svelte';
	import RotationCard from '#lib/components/RotationCard.svelte';
	import SearchForm from '#lib/components/SearchForm.svelte';
	import StatusCard from '#lib/components/StatusCard.svelte';
	import TopWinRates from '#lib/components/TopWinRates.svelte';
	import { EXAMPLE_SEARCHES, TOP_WIN_RATE_MIN_GAMES, formatCount } from '#lib/domain/front-page.ts';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	/** `Ahri, Jinx or NinjaGoldfinch#OCENZ`. */
	const separator = (i: number) =>
		i === 0 ? '' : i === EXAMPLE_SEARCHES.length - 1 ? ' or ' : ', ';
</script>

<svelte:head>
	<title>{PUBLIC_SITE_NAME}: League of Legends stats</title>
</svelte:head>

<section class="mx-auto max-w-2xl pt-6 text-center sm:pt-12">
	{#if data.patchLabel !== null || data.totalGames !== null}
		<p class="mb-4 flex flex-wrap justify-center gap-2 text-xs">
			{#if data.patchLabel !== null}
				<span class="rounded-full border border-accent/40 bg-accent/10 px-2.5 py-0.5 text-accent"
					>Patch {data.patchLabel}</span
				>
			{/if}
			{#if data.totalGames !== null}
				<span class="rounded-full border border-border px-2.5 py-0.5 text-muted"
					>{formatCount(data.totalGames)} ranked games analysed</span
				>
			{/if}
		</p>
	{/if}
	<h1 class="text-3xl font-semibold sm:text-4xl">Look up any League player</h1>
	<p class="mt-2 text-muted">
		Type a Riot ID and we find the region. Or type a champion for builds and matchups.
	</p>
	<div class="mt-6">
		<SearchForm size="large" champions={data.championNames} />
	</div>
	<p class="mt-2 text-xs text-muted">
		Try {#each EXAMPLE_SEARCHES as example, i (example.href)}{separator(i)}<a
				href={example.href}
				class="text-text underline decoration-border hover:text-accent">{example.label}</a
			>{/each}
	</p>
</section>

<div class="mx-auto max-w-2xl">
	<RecentSearches patch={data.patch} />
</div>

<div class="mt-12 grid gap-4 lg:grid-cols-3">
	<RotationCard champions={data.rotation} patch={data.patch} region={data.region} />
	<TopWinRates rows={data.topWinRates} patch={data.patch} minGames={TOP_WIN_RATE_MIN_GAMES} />
	<StatusCard
		status={data.status}
		statusPage={data.statusPage}
		checkedSeconds={data.statusCheckedSeconds}
		region={data.region}
	/>
</div>
