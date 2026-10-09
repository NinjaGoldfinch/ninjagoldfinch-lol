<script lang="ts">
	import { afterNavigate } from '$app/navigation';
	import { page } from '$app/state';
	import Scoreboard from '#lib/components/Scoreboard.svelte';
	import { formatMatchDate } from '#lib/domain/match-detail.ts';
	import { formatDuration } from '#lib/domain/matches.ts';
	import { parseRiotId, profilePath } from '#lib/domain/riot-id.ts';
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

	// Back to the profile the visitor came from. Without JavaScript that is the
	// `player`'s profile. With it, a match opened from a profile page goes back
	// through history, so that page's filters, page number and scroll return.
	let cameFrom = $state<string | null>(null);
	afterNavigate(({ from }) => {
		cameFrom = from?.url.pathname.startsWith('/summoner/')
			? from.url.pathname + from.url.search
			: null;
	});
	const back = $derived(cameFrom ?? (highlight ? profilePath(data.region.slug, highlight) : null));
	function goBack(event: MouseEvent) {
		if (!cameFrom || event.metaKey || event.ctrlKey || event.shiftKey || event.button !== 0) return;
		event.preventDefault();
		history.back();
	}

	const maxDamage = $derived(
		Math.max(0, ...data.teams.flatMap((t) => t.players.map((p) => p.damage)))
	);
</script>

<svelte:head>
	<title>{data.queue} · {data.matchId}</title>
</svelte:head>

<header>
	{#if back}
		<a
			href={back}
			onclick={goBack}
			class="mb-3 inline-flex items-center gap-1 text-sm text-muted hover:text-text hover:underline"
			><span aria-hidden="true">←</span>
			{highlight ? `Back to ${highlight.gameName}#${highlight.tagLine}` : 'Back to profile'}</a
		>
	{/if}
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
