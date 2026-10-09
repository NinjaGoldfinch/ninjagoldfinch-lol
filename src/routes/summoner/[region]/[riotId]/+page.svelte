<script lang="ts">
	import { onMount } from 'svelte';
	import MatchRow from '#lib/components/MatchRow.svelte';
	import ProfileHeader from '#lib/components/ProfileHeader.svelte';
	import RankBadge from '#lib/components/RankBadge.svelte';
	import { describeRanks } from '#lib/domain/ranks.ts';
	import { rememberSearch } from '#lib/recent-storage.ts';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();

	// After a refresh, the action's result is the freshest copy.
	const profile = $derived(form?.profile ?? data);
	const ranks = $derived(profile.ranks && describeRanks(profile.ranks));

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
	ageSeconds={profile.ageSeconds}
	refreshAvailableIn={profile.refreshAvailableIn}
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
	<h2 id="matches" class="text-sm font-medium tracking-wide text-muted uppercase">
		Recent matches
	</h2>
	<ul class="mt-2 space-y-2">
		{#each profile.matches as match (match.matchId)}
			<li><MatchRow {match} patch={profile.patch} /></li>
		{:else}
			<li class="text-muted">No recent matches.</li>
		{/each}
	</ul>
</section>
