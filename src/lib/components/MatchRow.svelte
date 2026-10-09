<script lang="ts">
	import {
		LANES,
		itemIconUrl,
		laneIconUrl,
		runeIconUrl,
		summonerSpellIconUrl
	} from '#lib/assets.ts';
	import {
		csPerMinute,
		formatDuration,
		itemSlots,
		kdaRatio,
		type MatchRow
	} from '#lib/domain/matches.ts';
	import ChampionIcon from './ChampionIcon.svelte';

	let { match, patch }: { match: MatchRow; patch: string } = $props();

	const RESULT = {
		win: { label: 'Victory', border: 'border-l-win', text: 'text-win' },
		loss: { label: 'Defeat', border: 'border-l-loss', text: 'text-loss' },
		remake: { label: 'Remake', border: 'border-l-border', text: 'text-muted' }
	} as const;
	const result = $derived(RESULT[match.result]);
	// Icons as of this game's patch, when riot-proxy knows its Data Dragon version.
	const version = $derived(match.ddragonVersion ?? patch);
	const slots = $derived(itemSlots(match));
	const lane = $derived(match.position ? laneIconUrl(version, match.position) : undefined);
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

	<div class="flex items-center gap-1.5">
		<!-- Champion with the lane on its lower-left corner and the level on its lower-right. -->
		<div class="relative">
			{#if match.champion.key}
				<ChampionIcon
					patch={version}
					id={match.champion.key}
					name={match.champion.name}
					size={56}
				/>
			{:else}
				<span class="block size-14 rounded bg-bg"></span>
			{/if}
			{#if lane && match.position}
				<img
					src={lane}
					alt={LANES[match.position]}
					title={LANES[match.position]}
					width="24"
					height="24"
					class="absolute -bottom-2 -left-2 size-6 rounded-full border border-border bg-bg p-0.5 brightness-110 grayscale"
				/>
			{/if}
			{#if match.champion.level !== null}
				<span
					title="Champion level {match.champion.level}"
					class="absolute -right-1.5 -bottom-1.5 min-w-5 rounded-full border border-border bg-bg px-1 text-center text-[11px] leading-[18px] font-semibold"
					><span class="sr-only">Level&nbsp;</span>{match.champion.level}</span
				>
			{/if}
		</div>
		<div class="flex flex-col gap-1">
			{#each match.spells as spell, i (i)}
				{#if spell}
					<img
						src={summonerSpellIconUrl(version, spell.id)}
						alt={spell.name}
						title={spell.name}
						width="28"
						height="28"
						loading="lazy"
						class="rounded-sm"
					/>
				{:else}
					<span class="size-7 rounded-sm bg-bg"></span>
				{/if}
			{/each}
		</div>
		<div class="flex flex-col items-center gap-1">
			{#if match.runes.keystone}
				<img
					src={runeIconUrl(match.runes.keystone.icon)}
					alt={match.runes.keystone.name}
					title={match.runes.keystone.name}
					width="28"
					height="28"
					loading="lazy"
					class="rounded-full bg-bg"
				/>
			{:else}
				<span class="size-7 rounded-full bg-bg"></span>
			{/if}
			{#if match.runes.secondary}
				<img
					src={runeIconUrl(match.runes.secondary.icon)}
					alt={match.runes.secondary.name}
					title={match.runes.secondary.name}
					width="20"
					height="20"
					loading="lazy"
					class="m-1"
				/>
			{:else}
				<span class="size-7"></span>
			{/if}
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
		<!-- Packed left: inventory, trinket, role quest item, then the empty slots. -->
		{#each slots as item, i (i)}
			<li>
				{#if item}
					<img
						src={itemIconUrl(version, item.id)}
						alt={item.name}
						title={item.roleQuest ? `Role quest: ${item.name}` : item.name}
						width="34"
						height="34"
						loading="lazy"
						class="rounded-sm"
					/>
				{:else}
					<span class="block size-[34px] rounded-sm bg-bg"></span>
				{/if}
			</li>
		{/each}
	</ul>
</article>
