<script lang="ts">
	import { page } from '$app/state';
	import AnalyticsFilters from '#lib/components/AnalyticsFilters.svelte';
	import ChampionIcon from '#lib/components/ChampionIcon.svelte';
	import SetBuilds from '#lib/components/SetBuilds.svelte';
	import { openBuild, roleLabel } from '#lib/domain/champion-page.ts';
	import { championPath } from '#lib/domain/champion-search.ts';
	import { ROLES, championQuery, formatRate, patchLabel } from '#lib/domain/champion-stats.ts';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	const path = $derived(championPath(data.champion));
	const query = $derived(championQuery(data.filter));
	const shownPatch = $derived(data.filter.patch ?? data.patch);
	const role = $derived(ROLES.find((r) => r.slug === data.filter.role)?.label ?? null);
	const scope = $derived(
		`Ranked Solo/Duo · every region and tier · ${patchLabel(shownPatch)}${role ? ` · ${role}` : ''}`
	);

	// The open build is in the URL but not in the load, as the table's sort is:
	// switching tab asks the server for nothing.
	const open = $derived(
		openBuild(page.url.searchParams.get('build'), data.setBuilds?.builds.length ?? 0)
	);
	const tabHref = (i: number) =>
		`${path}${query}${i === 0 ? '' : `${query ? '&' : '?'}build=${i + 1}`}#builds`;

	const stats = $derived(
		data.stats
			? [
					['Win rate', formatRate(data.stats.winRate)],
					['Pick rate', formatRate(data.stats.pickRate)],
					['Ban rate', formatRate(data.stats.banRate)],
					['Games', data.stats.games.toLocaleString('en')]
				]
			: []
	);
	const heading = 'text-xs font-medium tracking-wide text-muted uppercase';
</script>

<svelte:head>
	<title>{data.champion.name} · Builds and matchups</title>
</svelte:head>

<a href="/champions{query}" class="text-sm text-muted hover:text-accent">‹ All champions</a>

<div class="mt-3 flex flex-wrap items-center gap-4">
	<ChampionIcon patch={data.ddragonVersion} id={data.champion.id} name="" size={64} />
	<div>
		<h1 class="text-2xl font-semibold">{data.champion.name}</h1>
		<p class="mt-1 text-sm text-muted">{scope}</p>
	</div>
	{#if stats.length > 0}
		<dl class="flex flex-wrap gap-x-6 gap-y-2 sm:ml-auto" aria-label="Rates">
			{#each stats as [term, value] (term)}
				<div>
					<dt class={heading}>{term}</dt>
					<dd class="text-lg font-semibold tabular-nums">{value}</dd>
				</div>
			{/each}
		</dl>
	{/if}
</div>

{#if !data.stats}
	<p class="mt-4 text-muted">Not enough games recorded for this patch and role yet.</p>
{/if}

<div class="mt-6">
	<AnalyticsFilters {path} filter={data.filter} {shownPatch} patches={data.patches} />
</div>

<div class="mt-6 flex flex-col gap-6">
	<SetBuilds
		setBuilds={data.setBuilds}
		popular={data.popular}
		version={data.ddragonVersion}
		{open}
		{tabHref}
	/>

	<div class="grid gap-6 lg:grid-cols-2">
		<section aria-labelledby="matchups-heading" class="rounded border border-border bg-surface">
			<h2 id="matchups-heading" class="border-b border-border px-4 py-3 font-semibold">
				Matchups{#if data.matchupRole}<span class="font-normal text-muted"
						>{` · ${roleLabel(data.matchupRole)}`}</span
					>{/if}
			</h2>
			{#if data.matchups === null}
				<p class="px-4 py-3 text-sm text-muted">Matchups are unavailable right now.</p>
			{:else if data.matchups.length === 0}
				<p class="px-4 py-3 text-sm text-muted">No lane matchups recorded yet.</p>
			{:else}
				<p class="px-4 pt-3 text-xs text-muted">
					{data.champion.name}'s win rate against each lane opponent, most games first.
				</p>
				<!-- Long lists scroll inside the card. -->
				<div class="mt-2 max-h-[28rem] overflow-y-auto">
					<table class="w-full text-sm">
						<caption class="sr-only">Lane matchups</caption>
						<thead class="sticky top-0 bg-surface text-left text-xs text-muted">
							<tr>
								<th scope="col" class="px-4 py-2 font-normal">Against</th>
								{#if !data.matchupRole}<th scope="col" class="px-2 py-2 font-normal">Lane</th>{/if}
								<th scope="col" class="px-2 py-2 text-right font-normal whitespace-nowrap"
									>Win rate</th
								>
								<th scope="col" class="px-4 py-2 text-right font-normal">Games</th>
							</tr>
						</thead>
						<tbody>
							{#each data.matchups as m (`${m.role}-${m.opponentId}`)}
								<tr class="border-t border-border">
									<th scope="row" class="px-4 py-1.5 text-left font-medium">
										<span class="flex items-center gap-2">
											{#if m.key}
												<ChampionIcon patch={data.ddragonVersion} id={m.key} name="" size={24} />
												<a
													href="{championPath({ id: m.key, name: m.name })}{query}"
													class="hover:text-accent">{m.name}</a
												>
											{:else}
												<span class="size-6 rounded bg-bg" aria-hidden="true"></span>
												{m.name}
											{/if}
										</span>
									</th>
									{#if !data.matchupRole}<td class="px-2 py-1.5">{roleLabel(m.role)}</td>{/if}
									<td class="px-2 py-1.5 text-right tabular-nums">{formatRate(m.winRate)}</td>
									<td class="px-4 py-1.5 text-right text-muted tabular-nums"
										>{m.games.toLocaleString('en')}</td
									>
								</tr>
							{/each}
						</tbody>
					</table>
				</div>
			{/if}
		</section>

		<section aria-labelledby="tiers-heading" class="rounded border border-border bg-surface">
			<h2 id="tiers-heading" class="border-b border-border px-4 py-3 font-semibold">By tier</h2>
			{#if data.tiers.length === 0}
				<p class="px-4 py-3 text-sm text-muted">No games recorded by tier yet.</p>
			{:else}
				<div class="overflow-x-auto">
					<table class="w-full text-sm">
						<caption class="sr-only">Rates by tier</caption>
						<thead class="text-left text-xs text-muted">
							<tr>
								<th scope="col" class="px-4 py-2 font-normal">Tier</th>
								<th scope="col" class="px-2 py-2 text-right font-normal whitespace-nowrap"
									>Win rate</th
								>
								<th scope="col" class="px-2 py-2 text-right font-normal whitespace-nowrap"
									>Pick rate</th
								>
								<th scope="col" class="px-2 py-2 text-right font-normal whitespace-nowrap"
									>Ban rate</th
								>
								<th scope="col" class="px-4 py-2 text-right font-normal">Games</th>
							</tr>
						</thead>
						<tbody>
							{#each data.tiers as t (t.tier)}
								<tr class="border-t border-border">
									<th scope="row" class="px-4 py-1.5 text-left font-medium">{t.label}</th>
									<td class="px-2 py-1.5 text-right tabular-nums">{formatRate(t.winRate)}</td>
									<td class="px-2 py-1.5 text-right tabular-nums">{formatRate(t.pickRate)}</td>
									<td class="px-2 py-1.5 text-right tabular-nums">{formatRate(t.banRate)}</td>
									<td class="px-4 py-1.5 text-right text-muted tabular-nums"
										>{t.games.toLocaleString('en')}</td
									>
								</tr>
							{/each}
						</tbody>
					</table>
				</div>
				<p class="px-4 py-3 text-xs text-muted">
					Unplaced: players no ranked lookup has placed in a tier yet.
				</p>
			{/if}
		</section>
	</div>
</div>
