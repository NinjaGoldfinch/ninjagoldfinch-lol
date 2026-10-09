<script lang="ts">
	import { itemIconUrl, summonerSpellIconUrl } from '#lib/assets.ts';
	import { csPerMinute, formatDuration, kdaRatio, type MatchRow } from '#lib/domain/matches.ts';
	import ChampionIcon from './ChampionIcon.svelte';

	let { match, patch }: { match: MatchRow; patch: string } = $props();

	const RESULT = {
		win: { label: 'Victory', border: 'border-l-win', text: 'text-win' },
		loss: { label: 'Defeat', border: 'border-l-loss', text: 'text-loss' },
		remake: { label: 'Remake', border: 'border-l-border', text: 'text-muted' }
	} as const;
	const result = $derived(RESULT[match.result]);
</script>

<article
	class="flex flex-wrap items-center gap-x-5 gap-y-3 rounded border border-l-4 border-border bg-surface px-4 py-3 {result.border}"
	aria-label="{result.label} as {match.champion.name}"
>
	<div class="w-28 text-sm">
		<p class="font-semibold {result.text}">{result.label}</p>
		<p class="text-muted">{match.queue}</p>
		<p class="text-xs text-muted">
			{[match.duration !== null && formatDuration(match.duration), match.playedAgo]
				.filter(Boolean)
				.join(' · ')}
		</p>
	</div>

	<div class="flex items-center gap-2">
		{#if match.champion.key}
			<ChampionIcon {patch} id={match.champion.key} name={match.champion.name} size={44} />
		{/if}
		<div class="flex flex-col gap-1">
			{#each match.spells as spell, i (i)}
				{#if spell}
					<img
						src={summonerSpellIconUrl(patch, spell.id)}
						alt={spell.name}
						title={spell.name}
						width="20"
						height="20"
						loading="lazy"
						class="rounded-sm"
					/>
				{:else}
					<span class="size-5 rounded-sm bg-bg"></span>
				{/if}
			{/each}
		</div>
	</div>

	<div class="w-28 text-sm">
		<p class="font-semibold">
			{match.kills} / <span class="text-loss">{match.deaths}</span> / {match.assists}
		</p>
		<p class="text-muted">{kdaRatio(match.kills, match.deaths, match.assists)} KDA</p>
		<p class="text-xs text-muted">
			{match.cs} CS{#if match.duration}{` (${csPerMinute(match.cs, match.duration)}/min)`}{/if}
		</p>
	</div>

	<ul class="flex gap-1" aria-label="Items">
		{#each match.items as item, i (i)}
			<li>
				{#if item}
					<img
						src={itemIconUrl(patch, item.id)}
						alt={item.name}
						title={item.name}
						width="28"
						height="28"
						loading="lazy"
						class="rounded-sm"
					/>
				{:else}
					<span class="block size-7 rounded-sm bg-bg"></span>
				{/if}
			</li>
		{/each}
	</ul>
</article>
