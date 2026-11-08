<script lang="ts">
	let {
		query = '',
		message = null,
		champions = [],
		size = 'default'
	}: {
		query?: string;
		/** Why the last search found nothing, shown under the box. */
		message?: string | null;
		/** Champion names to suggest; none when the page has no Data Dragon names. */
		champions?: string[];
		/** `large` for the front page's hero; `default` everywhere else. */
		size?: 'default' | 'large';
	} = $props();

	const id = $props.id();
	const large = $derived(size === 'large');
</script>

<!-- A plain GET form, so search works without JavaScript. A query with # is a
     Riot ID, whose region riot-proxy finds (ADR-037); anything else is a
     champion's name. -->
<form method="GET" action="/search" role="search" class="flex w-full flex-col gap-1 sm:flex-1">
	<div class="flex w-full gap-2">
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
				class="w-full border border-border placeholder:text-muted focus:border-accent focus:outline-none {large
					? 'h-12 rounded-lg bg-surface px-4 text-base'
					: 'h-9 rounded bg-bg px-3 text-sm'}"
			/>
		</label>
		<button
			type="submit"
			class="bg-accent font-medium text-bg {large
				? 'h-12 rounded-lg px-6 text-base'
				: 'h-9 rounded px-4 text-sm'}"
		>
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
