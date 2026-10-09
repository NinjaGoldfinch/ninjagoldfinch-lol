<script lang="ts">
	import { DEFAULT_REGION, REGIONS } from '#lib/domain/regions.ts';

	let { region = DEFAULT_REGION, riotId = '' }: { region?: string; riotId?: string } = $props();
</script>

<!-- A plain GET form, so search works without JavaScript. -->
<form method="GET" action="/search" role="search" class="flex w-full gap-2 sm:flex-1">
	<label>
		<span class="sr-only">Region</span>
		<select
			name="region"
			class="h-9 w-28 rounded border border-border bg-bg px-2 text-sm focus:border-accent focus:outline-none sm:w-auto"
		>
			{#each REGIONS as r (r.slug)}
				<option value={r.slug} selected={r.slug === region}>{r.label}</option>
			{/each}
		</select>
	</label>
	<label class="min-w-0 flex-1">
		<span class="sr-only">Riot ID</span>
		<input
			name="riotId"
			value={riotId}
			required
			autocomplete="off"
			placeholder="Game name #TAG"
			class="h-9 w-full rounded border border-border bg-bg px-3 text-sm placeholder:text-muted focus:border-accent focus:outline-none"
		/>
	</label>
	<button type="submit" class="h-9 rounded bg-accent px-4 text-sm font-medium text-bg">
		Search
	</button>
</form>
