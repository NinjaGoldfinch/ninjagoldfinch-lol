<script lang="ts">
	import type { ChampionSummary } from '#lib/domain/champion-summary.ts';
	import ChampionIcon from './ChampionIcon.svelte';

	let {
		champions,
		patch,
		matchCount
	}: { champions: ChampionSummary[]; patch: string; matchCount: number } = $props();
</script>

<section aria-labelledby="champions">
	<h2 id="champions" class="text-sm font-medium tracking-wide text-muted uppercase">Champions</h2>
	<!-- Says what it covers: only the page of matches shown, not all-time stats. -->
	<p class="mt-1 text-xs text-muted">
		From the {matchCount}
		{matchCount === 1 ? 'match' : 'matches'} shown
	</p>
	{#if champions.length === 0}
		<p class="mt-2 text-sm text-muted">No games to summarise.</p>
	{:else}
		<ul class="mt-2 divide-y divide-border rounded border border-border bg-surface">
			{#each champions as c (c.id)}
				<li class="flex items-center gap-3 px-3 py-2" aria-label={c.name}>
					{#if c.key}
						<ChampionIcon {patch} id={c.key} name={c.name} size={36} />
					{:else}
						<span class="block size-9 rounded bg-bg"></span>
					{/if}
					<div class="min-w-0 flex-1 text-sm">
						<p class="flex justify-between gap-2">
							<span class="truncate font-medium">{c.name}</span>
							<span class={c.winRate >= 50 ? 'text-win' : 'text-loss'}>{c.winRate}%</span>
						</p>
						<p class="flex justify-between gap-2 text-xs text-muted">
							<span>{c.kda} KDA · {c.csPerMinute} CS/min</span>
							<span>{c.wins}W {c.losses}L</span>
						</p>
					</div>
				</li>
			{/each}
		</ul>
	{/if}
</section>
