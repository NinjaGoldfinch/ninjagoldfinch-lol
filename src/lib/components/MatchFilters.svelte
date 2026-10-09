<script lang="ts">
	import type { MatchFilter } from '#lib/domain/match-filters.ts';

	let { filter, options }: { filter: MatchFilter; options: { id: number; name: string }[] } =
		$props();
</script>

<!-- GET, so every filtered view has its own URL. Changing the queue resets to page 1. -->
<form method="GET" class="flex items-center gap-2">
	<label>
		<span class="sr-only">Queue</span>
		<select
			name="queue"
			class="h-9 rounded border border-border bg-bg px-2 text-sm focus:border-accent focus:outline-none"
			onchange={(event) => event.currentTarget.form?.requestSubmit()}
		>
			<option value="" selected={filter.queue === null}>All queues</option>
			{#each options as option (option.id)}
				<option value={option.id} selected={filter.queue === option.id}>{option.name}</option>
			{/each}
		</select>
	</label>
	<noscript>
		<button type="submit" class="h-9 rounded border border-border bg-surface px-3 text-sm">
			Apply
		</button>
	</noscript>
</form>
