<script lang="ts">
	import {
		DEFAULT_SORT,
		ROLES,
		championQuery,
		pickerPatches,
		type ChampionFilter,
		type ChampionSort
	} from '#lib/domain/champion-stats.ts';

	/** Role tabs and a patch picker for the champion pages. Both keep the other and the sort. */
	let {
		path,
		filter,
		shownPatch,
		patches,
		sort = DEFAULT_SORT
	}: {
		/** The page the links and the form go to. */
		path: string;
		filter: ChampionFilter;
		/** The patch on screen: the filter's, or the one riot-proxy chose. */
		shownPatch: string | null;
		patches: string[];
		sort?: ChampionSort;
	} = $props();

	const roleTabs = [{ slug: null, label: 'All roles' }, ...ROLES];
	const options = $derived(pickerPatches(shownPatch, patches));

	const submit = (event: Event & { currentTarget: HTMLSelectElement }) =>
		event.currentTarget.form?.requestSubmit();
</script>

<div class="flex flex-wrap items-center justify-between gap-3">
	<nav aria-label="Role">
		<ul class="flex flex-wrap gap-1">
			{#each roleTabs as tab (tab.label)}
				{@const current = filter.role === tab.slug}
				<li>
					<a
						href="{path}{championQuery({ ...filter, role: tab.slug }, sort)}"
						aria-current={current ? 'page' : undefined}
						class="block rounded border px-3 py-1.5 text-sm {current
							? 'border-accent bg-accent text-bg'
							: 'border-border bg-surface hover:text-accent'}">{tab.label}</a
					>
				</li>
			{/each}
		</ul>
	</nav>

	<!-- GET, so every view has its own URL; the role and sort are kept. -->
	<form method="GET" action={path} class="flex items-center gap-2">
		{#if filter.role}<input type="hidden" name="role" value={filter.role} />{/if}
		{#if sort !== DEFAULT_SORT}<input type="hidden" name="sort" value={sort} />{/if}
		<label>
			<span class="sr-only">Patch</span>
			<select
				name="patch"
				onchange={submit}
				class="h-9 rounded border border-border bg-bg px-2 text-sm focus:border-accent focus:outline-none"
			>
				<option value="all" selected={shownPatch === 'all'}>All patches</option>
				{#each options as patch (patch)}
					<option value={patch} selected={shownPatch === patch}>Patch {patch}</option>
				{/each}
			</select>
		</label>
		<noscript>
			<button type="submit" class="h-9 rounded border border-border bg-surface px-3 text-sm">
				Apply
			</button>
		</noscript>
	</form>
</div>
