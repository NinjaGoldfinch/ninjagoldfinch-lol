<script lang="ts">
	import { onMount } from 'svelte';
	import { rememberSearch } from '#lib/recent-storage.ts';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	onMount(() => {
		rememberSearch({ region: data.region.slug, ...data.riotId });
	});
</script>

<svelte:head>
	<title>{data.riotId.gameName}#{data.riotId.tagLine} · {data.region.label}</title>
</svelte:head>

<h1 class="text-2xl font-semibold">
	{data.riotId.gameName}<span class="text-muted">#{data.riotId.tagLine}</span>
</h1>
<p class="mt-1 text-sm text-muted">
	{[data.region.label, data.summoner && `Level ${data.summoner.summonerLevel}`]
		.filter(Boolean)
		.join(' · ')}
</p>

<section class="mt-6" aria-labelledby="ranks">
	<h2 id="ranks" class="text-sm font-medium tracking-wide text-muted uppercase">Rank</h2>
	{#if data.ranks === null}
		<p class="mt-2 text-muted">Rank is unavailable right now.</p>
	{:else if data.ranks.length === 0}
		<p class="mt-2 text-muted">Unranked.</p>
	{:else}
		<ul class="mt-2 space-y-1">
			{#each data.ranks as r (r.queueType)}
				<li>{r.queueType}: {r.tier} {r.rank}, {r.leaguePoints} LP ({r.wins}W {r.losses}L)</li>
			{/each}
		</ul>
	{/if}
</section>

<section class="mt-6" aria-labelledby="matches">
	<h2 id="matches" class="text-sm font-medium tracking-wide text-muted uppercase">
		Recent matches
	</h2>
	<ul class="mt-2 space-y-1">
		{#each data.matches as m (m.matchId)}
			<li data-result={m.result}>
				{m.result} · {m.champion.name} · {m.kills}/{m.deaths}/{m.assists}
			</li>
		{:else}
			<li class="text-muted">No recent matches.</li>
		{/each}
	</ul>
</section>
