<script lang="ts">
	import ChampionIcon from '#lib/components/ChampionIcon.svelte';
	import LowSample from '#lib/components/LowSample.svelte';
	import { championPath } from '#lib/domain/champion-search.ts';
	import { formatRate, isLowSample, type ChampionRow } from '#lib/domain/champion-stats.ts';
	import { winRateBar } from '#lib/domain/front-page.ts';

	/** The front page's top win rates: every region, tier and patch, over a floor of games. */
	let {
		rows,
		patch,
		minGames
	}: {
		/** null when riot-proxy's analytics were unavailable. */
		rows: ChampionRow[] | null;
		/** The Data Dragon version for icons; null when unavailable. */
		patch: string | null;
		minGames: number;
	} = $props();

	const id = $props.id();
</script>

<section aria-labelledby={id} class="rounded-lg border border-border bg-surface p-4">
	<div class="flex items-baseline justify-between gap-2">
		<h2 {id} class="text-xs font-medium tracking-wide text-muted uppercase">
			Top win rate · Ranked Solo
		</h2>
		<span class="text-[11px] whitespace-nowrap text-muted">min. {minGames} games</span>
	</div>
	{#if rows === null}
		<p class="mt-3 text-sm text-muted">Win rates are unavailable right now.</p>
	{:else if rows.length === 0}
		<p class="mt-3 text-sm text-muted">No champion has {minGames} games yet.</p>
	{:else}
		<ol class="mt-2 divide-y divide-border/60">
			{#each rows as row, i (row.id)}
				<li class="flex items-center gap-3 py-1.5">
					<span class="w-4 text-right text-xs text-muted tabular-nums">{i + 1}</span>
					{#if row.key && patch}
						<ChampionIcon {patch} id={row.key} name={row.name} />
					{:else}
						<span class="size-8 shrink-0 rounded bg-bg" aria-hidden="true"></span>
					{/if}
					<span class="min-w-0 flex-1 truncate text-sm">
						{#if row.key}
							<a href={championPath({ id: row.key, name: row.name })} class="hover:text-accent"
								>{row.name}</a
							>
						{:else}
							{row.name}
						{/if}
					</span>
					<span class="hidden h-1.5 w-20 overflow-hidden rounded bg-bg sm:block" aria-hidden="true">
						<span class="block h-full rounded bg-win" style:width="{winRateBar(row.winRate)}%"
						></span>
					</span>
					<span class="w-14 text-right text-sm font-medium tabular-nums">
						{formatRate(row.winRate)}{#if isLowSample(row.games)}<LowSample />{/if}
					</span>
				</li>
			{/each}
		</ol>
		<a href="/champions?sort=win" class="mt-2 inline-block text-sm text-accent hover:underline"
			>All champions →</a
		>
	{/if}
</section>
