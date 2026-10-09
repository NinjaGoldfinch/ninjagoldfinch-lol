<script lang="ts">
	import { onMount } from 'svelte';
	import { page } from '$app/state';
	import ChampionSummary from '#lib/components/ChampionSummary.svelte';
	import MatchFilters from '#lib/components/MatchFilters.svelte';
	import MatchRow from '#lib/components/MatchRow.svelte';
	import Pagination from '#lib/components/Pagination.svelte';
	import ProfileHeader from '#lib/components/ProfileHeader.svelte';
	import RankBadge from '#lib/components/RankBadge.svelte';
	import { summariseChampions } from '#lib/domain/champion-summary.ts';
	import { describeError } from '#lib/domain/error-view.ts';
	import { actionUrl } from '#lib/domain/match-filters.ts';
	import { describeRanks } from '#lib/domain/ranks.ts';
	import { rememberSearch } from '#lib/recent-storage.ts';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();

	// After a refresh, the action's result is the freshest copy.
	const profile = $derived(form?.profile ?? data);
	const ranks = $derived(profile.ranks && describeRanks(profile.ranks));
	const champions = $derived(profile.matches && summariseChampions(profile.matches));
	const matchesError = $derived(
		profile.matchesError &&
			describeError(profile.matchesError.status, profile.matchesError.retryAfter)
	);
	const queueName = $derived(profile.queueOptions.find((q) => q.id === profile.filter.queue)?.name);

	onMount(() => {
		rememberSearch({ region: data.region.slug, ...data.riotId });
	});
</script>

<svelte:head>
	<title>{profile.riotId.gameName}#{profile.riotId.tagLine} · {profile.region.label}</title>
</svelte:head>

<ProfileHeader
	riotId={profile.riotId}
	regionLabel={profile.region.label}
	summoner={profile.summoner}
	patch={profile.patch}
	fetchedAgeSeconds={profile.fetchedAgeSeconds}
	refreshAvailableIn={profile.refreshAvailableIn}
	refreshAction={actionUrl(profile.filter, 'refresh')}
/>

<!-- Wide screens: rank and champions beside the match list. -->
<div class="mt-8 grid gap-8 lg:grid-cols-[18rem_minmax(0,1fr)]">
	<aside class="flex flex-col gap-8">
		<section aria-labelledby="ranks">
			<h2 id="ranks" class="text-sm font-medium tracking-wide text-muted uppercase">Rank</h2>
			{#if ranks === null}
				<p class="mt-2 text-muted">Rank is unavailable right now.</p>
			{:else if ranks.length === 0}
				<p class="mt-2 text-muted">Unranked.</p>
			{:else}
				<div class="mt-2 grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
					{#each ranks as rank (rank.queue)}
						<RankBadge {rank} />
					{/each}
				</div>
			{/if}
		</section>

		{#if champions && profile.matches}
			<ChampionSummary {champions} patch={profile.patch} matchCount={profile.matches.length} />
		{/if}
	</aside>

	<section class="min-w-0" aria-labelledby="matches">
		<div class="flex flex-wrap items-center justify-between gap-2">
			<h2 id="matches" class="text-sm font-medium tracking-wide text-muted uppercase">
				Recent matches
			</h2>
			<MatchFilters
				filter={profile.filter}
				queues={profile.queueOptions}
				champions={profile.championOptions}
			/>
		</div>
		{#if profile.matches === null}
			<div role="status" class="mt-2 rounded border border-border bg-surface px-4 py-3">
				<p class="font-medium">Match history: {matchesError?.title}</p>
				<p class="mt-1 text-sm text-muted">{matchesError?.detail}</p>
			</div>
		{:else}
			<ul class="mt-2 space-y-2">
				{#each profile.matches as match (match.matchId)}
					<li><MatchRow {match} patch={profile.patch} /></li>
				{:else}
					<li class="text-muted">
						{queueName ? `No ${queueName} matches here.` : 'No matches here.'}
					</li>
				{/each}
			</ul>
			{#if profile.archiveComplete === false}
				<p class="mt-2 text-xs text-muted">
					Showing archived games only; older games are still loading.
				</p>
			{/if}
			{#if profile.customHidden}
				<p class="mt-2 text-xs text-muted">Custom games are not shown.</p>
			{/if}
			<Pagination path={page.url.pathname} filter={profile.filter} hasMore={profile.hasMore} />
		{/if}
	</section>
</div>
