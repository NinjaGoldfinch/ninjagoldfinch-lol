<script lang="ts">
	import { onMount } from 'svelte';
	import { profileIconUrl } from '#lib/assets.ts';
	import { ageSince } from '#lib/domain/age.ts';
	import type { RecentSearch } from '#lib/domain/recent.ts';
	import { findRegion } from '#lib/domain/regions.ts';
	import { profilePath, riotIdKey } from '#lib/domain/riot-id.ts';
	import { readRecent } from '#lib/recent-storage.ts';

	/** The Data Dragon version for profile icons; null when unavailable, and an initial shows. */
	let { patch }: { patch: string | null } = $props();

	// Read after mount: the list lives in this browser only, so the server
	// renders nothing here. Ages are counted from the same moment.
	let recent = $state<RecentSearch[]>([]);
	let now = $state(0);

	onMount(() => {
		now = Date.now();
		recent = readRecent();
	});

	/** `Oceania · Emerald III · viewed 2 minutes ago`, from what the entry has (ADR-068). */
	function details(r: RecentSearch): string {
		return [
			r.region && findRegion(r.region)?.label,
			r.rank,
			r.viewedAt !== undefined && `viewed ${ageSince(r.viewedAt, now)}`
		]
			.filter((part): part is string => typeof part === 'string' && part !== '')
			.join(' · ');
	}
</script>

{#if recent.length > 0}
	<section class="mt-10" aria-labelledby="recent-searches">
		<h2 id="recent-searches" class="text-xs font-medium tracking-wide text-muted uppercase">
			Recent searches
		</h2>
		<ul class="mt-3 grid gap-2 sm:grid-cols-2">
			{#each recent as r (riotIdKey(r))}
				{@const line = details(r)}
				<li>
					<a
						href={profilePath(r)}
						class="flex items-center gap-3 rounded-lg border border-border bg-surface px-3 py-2 hover:border-accent"
					>
						{#if patch && r.profileIconId !== undefined}
							<img
								src={profileIconUrl(patch, r.profileIconId)}
								alt=""
								width="36"
								height="36"
								loading="lazy"
								decoding="async"
								class="size-9 shrink-0 rounded-full bg-bg"
							/>
						{:else}
							<span
								class="flex size-9 shrink-0 items-center justify-center rounded-full bg-bg text-sm text-muted"
								aria-hidden="true">{r.gameName.charAt(0).toUpperCase()}</span
							>
						{/if}
						<span class="min-w-0">
							<span class="block truncate text-sm font-medium"
								>{r.gameName}<span class="text-muted">#{r.tagLine}</span></span
							>
							{#if line}
								<span class="block truncate text-xs text-muted">{line}</span>
							{/if}
						</span>
					</a>
				</li>
			{/each}
		</ul>
	</section>
{/if}
