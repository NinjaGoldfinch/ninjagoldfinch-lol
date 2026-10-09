<script lang="ts">
	import type { MatchFilter } from '#lib/domain/match-filters.ts';

	type Option = { id: number; name: string };

	let {
		filter,
		queues,
		champions
	}: { filter: MatchFilter; queues: Option[]; champions: Option[] } = $props();

	const select =
		'h-9 rounded border border-border bg-bg px-2 text-sm focus:border-accent focus:outline-none';
	const submit = (event: Event & { currentTarget: HTMLSelectElement }) =>
		event.currentTarget.form?.requestSubmit();
</script>

<!-- GET, so every filtered view has its own URL. Changing a filter resets to page 1. -->
<form method="GET" class="flex flex-wrap items-center gap-2">
	<label>
		<span class="sr-only">Queue</span>
		<select name="queue" class={select} onchange={submit}>
			<option value="" selected={filter.queue === null}>All queues</option>
			{#each queues as option (option.id)}
				<option value={option.id} selected={filter.queue === option.id}>{option.name}</option>
			{/each}
		</select>
	</label>
	<label>
		<span class="sr-only">Champion</span>
		<select name="champion" class="{select} max-w-40" onchange={submit}>
			<option value="" selected={filter.champion === null}>All champions</option>
			{#each champions as option (option.id)}
				<option value={option.id} selected={filter.champion === option.id}>{option.name}</option>
			{/each}
		</select>
	</label>
	<noscript>
		<button type="submit" class="h-9 rounded border border-border bg-surface px-3 text-sm">
			Apply
		</button>
	</noscript>
</form>
