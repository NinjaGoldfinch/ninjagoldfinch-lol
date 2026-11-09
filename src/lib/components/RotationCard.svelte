<script lang="ts">
	import ChampionIcon from '#lib/components/ChampionIcon.svelte';
	import RegionPicker from '#lib/components/RegionPicker.svelte';
	import { championPath } from '#lib/domain/champion-search.ts';
	import type { RotationChampion } from '#lib/domain/front-page.ts';

	/** This week's free champions on a region (ADR-071). */
	let {
		champions,
		patch,
		region
	}: {
		/** null when riot-proxy's rotation was unavailable or unreadable. */
		champions: RotationChampion[] | null;
		/** The Data Dragon version for icons; null when unavailable. */
		patch: string | null;
		region: { slug: string; label: string };
	} = $props();

	const id = $props.id();
</script>

<section aria-labelledby={id} class="rounded-lg border border-border bg-surface p-4">
	<div class="flex items-center justify-between gap-2">
		<h2 {id} class="text-xs font-medium tracking-wide text-muted uppercase">Free this week</h2>
		<RegionPicker {region} />
	</div>
	{#if champions === null || champions.length === 0 || patch === null}
		<p class="mt-3 text-sm text-muted">Free rotation is unavailable right now.</p>
	{:else}
		<ul
			class="mt-3 grid grid-cols-8 gap-1.5 [&_img]:h-auto [&_img]:w-full"
			aria-label="Free champions"
		>
			{#each champions as c (c.id)}
				<li>
					<a href={championPath({ id: c.key, name: c.name })} class="block hover:opacity-80">
						<ChampionIcon {patch} id={c.key} name={c.name} size={40} />
					</a>
				</li>
			{/each}
		</ul>
		<p class="mt-3 text-xs text-muted">
			{champions.length} champions free to play on {region.label}.
		</p>
	{/if}
</section>
