<script lang="ts">
	import { page } from '$app/state';
	import Scoreboard from '#lib/components/Scoreboard.svelte';
	import { formatMatchDate } from '#lib/domain/match-detail.ts';
	import { formatDuration } from '#lib/domain/matches.ts';
	import { parseRiotId } from '#lib/domain/riot-id.ts';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	const facts = $derived(
		[
			data.duration !== null && formatDuration(data.duration),
			data.patch && `Patch ${data.patch}`,
			data.startedAt !== null && formatMatchDate(data.startedAt),
			data.region.label
		].filter(Boolean)
	);
	// `?player=GameName-TAG`: whose champion to highlight, set by profile links.
	// Read here, not in the load, so the load's data is the same for everyone.
	const highlight = $derived(parseRiotId(page.url.searchParams.get('player') ?? '') ?? null);
	const maxDamage = $derived(
		Math.max(0, ...data.teams.flatMap((t) => t.players.map((p) => p.damage)))
	);
</script>

<svelte:head>
	<title>{data.queue} · {data.matchId}</title>
</svelte:head>

<header>
	<h1 class="text-2xl font-semibold">{data.queue}</h1>
	<p class="mt-1 text-sm text-muted">{facts.join(' · ')}</p>
</header>

<div class="mt-6 flex flex-col gap-6">
	{#each data.teams as team (team.teamId)}
		<Scoreboard
			{team}
			version={data.ddragonVersion}
			region={data.region.slug}
			{maxDamage}
			{highlight}
		/>
	{/each}
</div>
