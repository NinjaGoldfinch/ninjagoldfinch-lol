<script lang="ts">
	import { page } from '$app/state';
	import AnalyticsFilters from '#lib/components/AnalyticsFilters.svelte';
	import ChampionIcon from '#lib/components/ChampionIcon.svelte';
	import { championPath } from '#lib/domain/champion-search.ts';
	import {
		championQuery,
		formatRate,
		parseSort,
		patchLabel,
		sortRows,
		type ChampionSort
	} from '#lib/domain/champion-stats.ts';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	// The sort lives in the URL but not in the load, so it changes without a
	// request: the rows are sorted here, on the server and in the browser alike.
	const sort = $derived(parseSort(page.url.searchParams.get('sort')));
	const rows = $derived(sortRows(data.table.rows, sort));
	const shownPatch = $derived(data.filter.patch ?? data.table.patch);
	const label = $derived(patchLabel(shownPatch));

	const columns: { sort: ChampionSort; label: string }[] = [
		{ sort: 'win', label: 'Win rate' },
		{ sort: 'pick', label: 'Pick rate' },
		{ sort: 'ban', label: 'Ban rate' }
	];
</script>

<svelte:head>
	<title>Champions · {label}</title>
</svelte:head>

<h1 class="text-2xl font-semibold">Champions</h1>
<p class="mt-1 text-sm text-muted">Ranked Solo/Duo · every region and tier · {label}</p>

<div class="mt-6">
	<AnalyticsFilters
		path="/champions"
		filter={data.filter}
		{shownPatch}
		patches={data.patches}
		{sort}
	/>
</div>

{#if rows.length === 0}
	<p class="mt-6 text-muted">No games recorded for this patch and role yet.</p>
{:else}
	<!-- Narrow screens scroll the table inside its box, not the page. -->
	<div class="mt-4 overflow-x-auto rounded border border-border bg-surface">
		<table class="w-full text-sm">
			<caption class="sr-only">Champion win, pick and ban rates, {label}</caption>
			<thead class="border-b border-border text-left text-xs text-muted">
				<tr>
					<th scope="col" class="hidden w-10 px-3 py-2 text-right font-normal sm:table-cell">#</th>
					<th scope="col" class="px-3 py-2 font-normal">Champion</th>
					{#each columns as column (column.sort)}
						<th
							scope="col"
							aria-sort={sort === column.sort ? 'descending' : undefined}
							class="px-3 py-2 text-right font-normal whitespace-nowrap"
						>
							<a
								href="/champions{championQuery(data.filter, column.sort)}"
								data-sveltekit-reset="false"
								data-sveltekit-replacestate
								class="hover:text-accent {sort === column.sort ? 'font-semibold text-text' : ''}"
								>{column.label}{#if sort === column.sort}<span aria-hidden="true" class="ml-0.5"
										>↓</span
									>{/if}</a
							>
						</th>
					{/each}
					<th scope="col" class="px-3 py-2 text-right font-normal">Games</th>
				</tr>
			</thead>
			<tbody>
				{#each rows as row, i (row.id)}
					<tr class="border-b border-border last:border-0">
						<td class="hidden px-3 py-1.5 text-right text-muted tabular-nums sm:table-cell"
							>{i + 1}</td
						>
						<th scope="row" class="px-3 py-1.5 text-left font-medium">
							<span class="flex items-center gap-2">
								{#if row.key}
									<ChampionIcon patch={data.ddragonVersion} id={row.key} name="" size={28} />
									<a
										href="{championPath({ id: row.key, name: row.name })}{championQuery(
											data.filter
										)}"
										class="hover:text-accent">{row.name}</a
									>
								{:else}
									<span class="size-7 rounded bg-bg" aria-hidden="true"></span>
									{row.name}
								{/if}
							</span>
						</th>
						<td class="px-3 py-1.5 text-right tabular-nums">{formatRate(row.winRate)}</td>
						<td class="px-3 py-1.5 text-right tabular-nums">{formatRate(row.pickRate)}</td>
						<td class="px-3 py-1.5 text-right tabular-nums">{formatRate(row.banRate)}</td>
						<td class="px-3 py-1.5 text-right text-muted tabular-nums"
							>{row.games.toLocaleString('en')}</td
						>
					</tr>
				{/each}
			</tbody>
		</table>
	</div>
	<p class="mt-3 text-xs text-muted">From archived ranked games. Each rate counts every tier.</p>
{/if}
