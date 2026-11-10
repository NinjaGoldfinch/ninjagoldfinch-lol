<script lang="ts">
	import { FRONT_REGIONS } from '#lib/domain/front-page.ts';

	/**
	 * The front page's region, for its status card (ADR-071, ADR-076). A
	 * GET form, so it works without JavaScript; with it, it applies on change
	 * and keeps the scroll, as the other in-place controls do (ADR-072). The
	 * top-win-rate card's view goes with it as hidden inputs (ADR-077).
	 */
	let {
		region,
		keep = []
	}: {
		region: { slug: string };
		/** Fields of the page's other controls, kept when the region changes. */
		keep?: [string, string][];
	} = $props();

	const submit = (event: Event & { currentTarget: HTMLSelectElement }) =>
		event.currentTarget.form?.requestSubmit();
</script>

<form
	method="GET"
	action="/"
	aria-label="Region"
	data-sveltekit-reset="false"
	class="flex items-center gap-1"
>
	{#each keep as [name, value] (name)}
		<input type="hidden" {name} {value} />
	{/each}
	<label>
		<span class="sr-only">Region</span>
		<select
			name="region"
			onchange={submit}
			class="h-7 max-w-36 rounded border border-border bg-bg px-1.5 text-[11px] text-muted focus:border-accent focus:outline-none"
		>
			{#each FRONT_REGIONS as r (r.slug)}
				<option value={r.slug} selected={r.slug === region.slug}>{r.label}</option>
			{/each}
		</select>
	</label>
	<noscript>
		<button type="submit" class="h-7 rounded border border-border bg-surface px-2 text-[11px]">
			Apply
		</button>
	</noscript>
</form>
