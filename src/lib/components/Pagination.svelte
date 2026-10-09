<script lang="ts">
	import { filterQuery, MAX_PAGE, type MatchFilter } from '#lib/domain/match-filters.ts';

	let { path, filter, hasMore }: { path: string; filter: MatchFilter; hasMore: boolean } = $props();

	const link = 'rounded border border-border bg-surface px-3 py-1.5 hover:border-accent';
</script>

<nav aria-label="Match pages" class="mt-4 flex items-center gap-3 text-sm">
	{#if filter.page > 1}
		<a class={link} href="{path}{filterQuery({ ...filter, page: filter.page - 1 })}">Newer</a>
	{/if}
	<span class="text-muted">Page {filter.page}</span>
	{#if hasMore && filter.page < MAX_PAGE}
		<a class={link} href="{path}{filterQuery({ ...filter, page: filter.page + 1 })}">Older</a>
	{/if}
</nav>
