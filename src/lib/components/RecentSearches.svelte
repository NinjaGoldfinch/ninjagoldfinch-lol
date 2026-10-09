<script lang="ts">
	import { onMount } from 'svelte';
	import type { RecentSearch } from '#lib/domain/recent.ts';
	import { findRegion } from '#lib/domain/regions.ts';
	import { profilePath } from '#lib/domain/riot-id.ts';
	import { readRecent } from '#lib/recent-storage.ts';

	// Read after mount: the list lives in this browser only, so the server
	// renders nothing here.
	let recent = $state<RecentSearch[]>([]);

	onMount(() => {
		recent = readRecent();
	});
</script>

{#if recent.length > 0}
	<section class="mt-10" aria-labelledby="recent-searches">
		<h2 id="recent-searches" class="text-sm font-medium tracking-wide text-muted uppercase">
			Recent searches
		</h2>
		<ul class="mt-3 flex flex-wrap gap-2">
			{#each recent as r (`${r.region}/${r.gameName}#${r.tagLine}`)}
				<li>
					<a
						href={profilePath(r.region, r)}
						class="block rounded border border-border bg-surface px-3 py-1.5 text-sm hover:border-accent"
					>
						{r.gameName}<span class="text-muted">#{r.tagLine}</span>
						<span class="ml-1 text-xs text-muted">{findRegion(r.region)?.label ?? r.region}</span>
					</a>
				</li>
			{/each}
		</ul>
	</section>
{/if}
