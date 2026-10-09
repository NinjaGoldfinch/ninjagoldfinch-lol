<script lang="ts">
	import { onMount } from 'svelte';
	import { page } from '$app/state';
	import MatchFilters from '#lib/components/MatchFilters.svelte';
	import MatchRow from '#lib/components/MatchRow.svelte';
	import Pagination from '#lib/components/Pagination.svelte';
	import ProfileHeader from '#lib/components/ProfileHeader.svelte';
	import RankBadge from '#lib/components/RankBadge.svelte';
	import { actionUrl } from '#lib/domain/match-filters.ts';
	import { describeRanks } from '#lib/domain/ranks.ts';
	import { rememberSearch } from '#lib/recent-storage.ts';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();

	// After a refresh, the action's result is the freshest copy.
	const profile = $derived(form?.profile ?? data);
	const ranks = $derived(profile.ranks && describeRanks(profile.ranks));
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
	refreshed={profile.refreshed}
	refreshAvailableIn={profile.refreshAvailableIn}
	refreshAction={actionUrl(profile.filter, 'refresh')}
/>

<section class="mt-8" aria-labelledby="ranks">
	<h2 id="ranks" class="text-sm font-medium tracking-wide text-muted uppercase">Rank</h2>
	{#if ranks === null}
		<p class="mt-2 text-muted">Rank is unavailable right now.</p>
	{:else if ranks.length === 0}
		<p class="mt-2 text-muted">Unranked.</p>
	{:else}
		<div class="mt-2 grid gap-3 sm:grid-cols-2">
			{#each ranks as rank (rank.queue)}
				<RankBadge {rank} />
			{/each}
		</div>
	{/if}
</section>

<section class="mt-8" aria-labelledby="matches">
	<div class="flex flex-wrap items-center justify-between gap-2">
		<h2 id="matches" class="text-sm font-medium tracking-wide text-muted uppercase">
			Recent matches
		</h2>
		<MatchFilters filter={profile.filter} options={profile.queueOptions} />
	</div>
	<ul class="mt-2 space-y-2">
		{#each profile.matches as match (match.matchId)}
			<li><MatchRow {match} patch={profile.patch} /></li>
		{:else}
			<li class="text-muted">
				{queueName ? `No ${queueName} matches here.` : 'No matches here.'}
			</li>
		{/each}
	</ul>
	<Pagination path={page.url.pathname} filter={profile.filter} hasMore={profile.hasMore} />
</section>
