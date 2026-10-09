<script lang="ts">
	import { runeIconUrl, summonerSpellIconUrl } from '#lib/assets.ts';
	import type { MatchRow } from '#lib/domain/matches.ts';

	// Summoner spells in one column, keystone over secondary path in the next.
	let {
		spells,
		runes,
		version,
		size = 28
	}: Pick<MatchRow, 'spells' | 'runes'> & { version: string; size?: number } = $props();

	// The secondary path is drawn smaller, centred in a full-size cell.
	const small = $derived(Math.round((size * 5) / 7));
	const gap = $derived((size - small) / 2);
</script>

<div class="flex flex-col gap-1">
	{#each spells as spell, i (i)}
		{#if spell}
			<img
				src={summonerSpellIconUrl(version, spell.id)}
				alt={spell.name}
				title={spell.name}
				width={size}
				height={size}
				loading="lazy"
				class="rounded-sm"
			/>
		{:else}
			<span class="rounded-sm bg-bg" style:width="{size}px" style:height="{size}px"></span>
		{/if}
	{/each}
</div>
<div class="flex flex-col items-center gap-1">
	{#if runes.keystone}
		<img
			src={runeIconUrl(runes.keystone.icon)}
			alt={runes.keystone.name}
			title={runes.keystone.name}
			width={size}
			height={size}
			loading="lazy"
			class="rounded-full bg-bg"
		/>
	{:else}
		<span class="rounded-full bg-bg" style:width="{size}px" style:height="{size}px"></span>
	{/if}
	{#if runes.secondary}
		<img
			src={runeIconUrl(runes.secondary.icon)}
			alt={runes.secondary.name}
			title={runes.secondary.name}
			width={small}
			height={small}
			loading="lazy"
			style:margin="{gap}px"
		/>
	{:else}
		<span style:width="{size}px" style:height="{size}px"></span>
	{/if}
</div>
