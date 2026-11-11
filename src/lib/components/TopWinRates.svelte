<script lang="ts">
	import ChampionIcon from '#lib/components/ChampionIcon.svelte';
	import { championPath } from '#lib/domain/champion-search.ts';
	import {
		RANK_OPTIONS,
		ROLES,
		championQuery,
		formatRate,
		rankLabel,
		rankValue,
		type ChampionFilter,
		type ChampionSort
	} from '#lib/domain/champion-stats.ts';
	import {
		cardFields,
		cardHeading,
		cardScope,
		formatCount,
		frontQuery,
		rateBar,
		regionFields,
		type FrontCard,
		type TopChampions
	} from '#lib/domain/front-page.ts';

	/**
	 * The front page's top champions, every region summed: a patch, role and
	 * tier to slice by, win, pick or ban rate to rank by, over a floor of games
	 * (ADR-066, ADR-077). Links and a GET form, so it works without JavaScript;
	 * each control keeps the region and the others.
	 */
	let {
		top,
		card,
		region,
		patch
	}: {
		/** null when riot-proxy's analytics were unavailable. */
		top: TopChampions | null;
		card: FrontCard;
		/** The status card's region, kept by every control. */
		region: { slug: string };
		/** The Data Dragon version for icons; null when unavailable. */
		patch: string | null;
	} = $props();

	const id = $props.id();

	const heading = $derived(cardHeading(card.sort));
	const scope = $derived(cardScope(card.filter, top?.patch ?? null));
	const rank = $derived(card.filter.rank ? rankValue(card.filter.rank) : '');

	/** `/`, or `/?region=kr&role=mid`: this page with one part of the view changed. */
	const href = (filter: Partial<ChampionFilter>, sort: ChampionSort = card.sort) =>
		`/${frontQuery(region, { filter: { ...card.filter, ...filter }, sort })}`;

	const patchTabs = [
		{ patch: null, label: 'This patch' },
		{ patch: 'all', label: 'All patches' }
	] as const;
	const roleTabs = [{ slug: null, label: 'All roles' }, ...ROLES];
	const columns: { sort: ChampionSort; label: string }[] = [
		{ sort: 'win', label: 'Win rate' },
		{ sort: 'pick', label: 'Pick rate' },
		{ sort: 'ban', label: 'Ban rate' }
	];

	/** The tier form's hidden inputs: the region and the rest of the view. */
	const kept = $derived([
		...regionFields(region),
		...cardFields({ ...card, filter: { ...card.filter, rank: null } })
	]);

	const tab = (current: boolean) =>
		`block rounded border px-2 py-0.5 text-xs ${
			current ? 'border-accent bg-accent text-bg' : 'border-border bg-bg hover:text-accent'
		}`;

	const submit = (event: Event & { currentTarget: HTMLSelectElement }) =>
		event.currentTarget.form?.requestSubmit();
</script>

<section aria-labelledby={id} class="flex flex-col rounded-lg border border-border bg-surface p-4">
	<div class="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
		<h2 {id} class="text-xs font-medium tracking-wide text-muted uppercase">
			{heading} · Ranked Solo
		</h2>
		{#if top}
			<span class="text-[11px] text-muted">{scope} · min. {formatCount(top.minGames)} games</span>
		{/if}
	</div>

	<div class="mt-3 flex flex-wrap items-center gap-2">
		<nav aria-label="Patch">
			<ul class="flex gap-1">
				{#each patchTabs as option (option.label)}
					{@const current = card.filter.patch === option.patch}
					<li>
						<a
							href={href({ patch: option.patch })}
							aria-current={current ? 'page' : undefined}
							data-sveltekit-reset="false"
							class={tab(current)}>{option.label}</a
						>
					</li>
				{/each}
			</ul>
		</nav>
		<nav aria-label="Role">
			<ul class="flex flex-wrap gap-1">
				{#each roleTabs as option (option.label)}
					{@const current = card.filter.role === option.slug}
					<li>
						<a
							href={href({ role: option.slug })}
							aria-current={current ? 'page' : undefined}
							data-sveltekit-reset="false"
							class={tab(current)}>{option.label}</a
						>
					</li>
				{/each}
			</ul>
		</nav>
		<!-- GET, so every view has its own URL; the region and the rest of the view are kept. -->
		<form
			method="GET"
			action="/"
			aria-label="Tier"
			data-sveltekit-reset="false"
			class="flex items-center gap-1"
		>
			{#each kept as [name, value] (name)}
				<input type="hidden" {name} {value} />
			{/each}
			<label>
				<span class="sr-only">Tier</span>
				<select
					name="rank"
					onchange={submit}
					class="h-6 rounded border border-border bg-bg px-1.5 text-xs text-muted focus:border-accent focus:outline-none"
				>
					<option value="" selected={rank === ''}>All tiers</option>
					{#each [{ label: 'Tier and above', ranks: RANK_OPTIONS.ranges }, { label: 'One tier', ranks: RANK_OPTIONS.tiers }] as group (group.label)}
						<optgroup label={group.label}>
							{#each group.ranks as option (rankValue(option))}
								<option value={rankValue(option)} selected={rank === rankValue(option)}
									>{rankLabel(option)}</option
								>
							{/each}
						</optgroup>
					{/each}
				</select>
			</label>
			<noscript>
				<button type="submit" class="h-6 rounded border border-border bg-bg px-2 text-xs">
					Apply
				</button>
			</noscript>
		</form>
	</div>

	{#if top === null}
		<p class="mt-3 text-sm text-muted">Champion stats are unavailable right now.</p>
	{:else if top.rows.length === 0}
		<p class="mt-3 text-sm text-muted">
			No champion has {formatCount(top.minGames)} games for {scope} yet.
		</p>
	{:else}
		<table class="mt-2 w-full text-sm">
			<caption class="sr-only"
				>{heading}, {scope}, over {formatCount(top.minGames)} games or more</caption
			>
			<thead class="text-left text-[11px] text-muted">
				<tr>
					<th scope="col" class="w-6 py-1.5 pr-2 text-right font-normal">#</th>
					<th scope="col" class="py-1.5 font-normal">Champion</th>
					<td class="hidden sm:table-cell" aria-hidden="true"></td>
					{#each columns as column (column.sort)}
						{@const current = card.sort === column.sort}
						<th
							scope="col"
							aria-sort={current ? 'descending' : undefined}
							class="w-16 py-1.5 pl-2 text-right font-normal whitespace-nowrap"
						>
							<a
								href={href({}, column.sort)}
								data-sveltekit-reset="false"
								data-sveltekit-replacestate
								class="hover:text-accent {current ? 'font-semibold text-text' : ''}"
								>{column.label}{#if current}<span aria-hidden="true" class="ml-0.5">↓</span>{/if}</a
							>
						</th>
					{/each}
					<th scope="col" class="hidden w-20 py-1.5 pl-2 text-right font-normal sm:table-cell"
						>Games</th
					>
				</tr>
			</thead>
			<tbody>
				{#each top.rows as row, i (row.id)}
					{@const rates = { win: row.winRate, pick: row.pickRate, ban: row.banRate }}
					<tr class="border-t border-border/60">
						<td class="py-1.5 pr-2 text-right text-xs text-muted tabular-nums">{i + 1}</td>
						<th scope="row" class="py-1.5 text-left font-normal">
							<span class="flex min-w-0 items-center gap-2">
								{#if row.key && patch}
									<ChampionIcon {patch} id={row.key} name={row.name} />
								{:else}
									<span class="size-8 shrink-0 rounded bg-bg" aria-hidden="true"></span>
								{/if}
								{#if row.key}
									<a
										href={championPath({ id: row.key, name: row.name })}
										class="truncate hover:text-accent">{row.name}</a
									>
								{:else}
									<span class="truncate">{row.name}</span>
								{/if}
							</span>
						</th>
						<td class="hidden py-1.5 pl-2 sm:table-cell" aria-hidden="true">
							<span class="ml-auto block h-1.5 w-20 overflow-hidden rounded bg-bg">
								<span
									class="block h-full rounded bg-win"
									style:width="{rateBar(row, card.sort, top.rows)}%"
								></span>
							</span>
						</td>
						{#each columns as column (column.sort)}
							<td
								class="py-1.5 pl-2 text-right tabular-nums {card.sort === column.sort
									? 'font-medium'
									: 'text-muted'}">{formatRate(rates[column.sort])}</td
							>
						{/each}
						<td class="hidden py-1.5 pl-2 text-right text-muted tabular-nums sm:table-cell"
							>{formatCount(row.games)}</td
						>
					</tr>
				{/each}
			</tbody>
		</table>
	{/if}
	<a
		href="/champions{championQuery(card.filter, card.sort)}"
		class="mt-auto inline-block pt-2 text-sm text-accent hover:underline">All champions →</a
	>
</section>
