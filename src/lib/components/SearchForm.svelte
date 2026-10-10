<script lang="ts">
	import { DEFAULT_REGION, REGIONS } from '#lib/domain/regions.ts';

	let {
		region = DEFAULT_REGION,
		query = '',
		message = null,
		champions = []
	}: {
		region?: string;
		query?: string;
		/** Why the last search found nothing, shown under the box. */
		message?: string | null;
		/** Champion names to suggest; none when the page has no Data Dragon names. */
		champions?: string[];
	} = $props();

	const id = $props.id();
</script>

<!-- A plain GET form, so search works without JavaScript. A query with # is a
     Riot ID; anything else is a champion's name. -->
<form method="GET" action="/search" role="search" class="flex w-full flex-col gap-1 sm:flex-1">
	<div class="flex w-full gap-2">
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
			<span class="sr-only">Riot ID or champion</span>
			<input
				name="q"
				value={query}
				required
				autocomplete="off"
				placeholder="Game name #TAG or champion"
				list={champions.length > 0 ? `${id}-champions` : undefined}
				aria-invalid={message ? 'true' : undefined}
				aria-describedby={message ? `${id}-message` : undefined}
				class="h-9 w-full rounded border border-border bg-bg px-3 text-sm placeholder:text-muted focus:border-accent focus:outline-none"
			/>
		</label>
		<button type="submit" class="h-9 rounded bg-accent px-4 text-sm font-medium text-bg">
			Search
		</button>
	</div>
	{#if champions.length > 0}
		<datalist id="{id}-champions">
			{#each champions as name (name)}<option value={name}></option>{/each}
		</datalist>
	{/if}
	{#if message}
		<p id="{id}-message" class="text-sm text-loss">{message}</p>
	{/if}
</form>
