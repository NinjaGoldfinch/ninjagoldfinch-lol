<script lang="ts">
	import RegionPicker from '#lib/components/RegionPicker.svelte';
	import { formatAge } from '#lib/domain/age.ts';
	import { allRunning, type PlatformStatus, type StatusItem } from '#lib/domain/front-page.ts';

	/** Riot's status feed for a region: open incidents and maintenances (ADR-067). */
	let {
		status,
		checkedSeconds,
		region
	}: {
		/** null when riot-proxy's status was unavailable or unreadable. */
		status: PlatformStatus | null;
		/** Seconds since riot-proxy read the feed from Riot, when it said. */
		checkedSeconds: number | null;
		region: { slug: string; label: string };
	} = $props();

	const id = $props.id();

	const items = $derived(
		status
			? [
					...status.incidents.map((item) => ({ item, kind: 'Incident' as const })),
					...status.maintenances.map((item) => ({ item, kind: 'Maintenance' as const }))
				]
			: []
	);

	/** `warning`, `scheduled`, `in progress`. */
	function state(item: StatusItem, kind: 'Incident' | 'Maintenance'): string | null {
		const value = kind === 'Incident' ? item.severity : item.maintenanceStatus;
		return value ? value.replaceAll('_', ' ') : null;
	}

	function dot(item: StatusItem, kind: 'Incident' | 'Maintenance'): string {
		if (kind === 'Maintenance') return 'bg-accent';
		return item.severity === 'info' ? 'bg-muted' : 'bg-loss';
	}
</script>

<section aria-labelledby={id} class="rounded-lg border border-border bg-surface p-4">
	<div class="flex items-center justify-between gap-2">
		<h2 {id} class="text-xs font-medium tracking-wide text-muted uppercase">Server status</h2>
		<RegionPicker {region} />
	</div>
	{#if status === null}
		<p class="mt-3 text-sm text-muted">Server status is unavailable right now.</p>
	{:else}
		{#if allRunning(status)}
			<p class="mt-3 flex items-center gap-2">
				<span class="size-2.5 shrink-0 rounded-full bg-ok" aria-hidden="true"></span>
				<span class="text-sm font-medium">All services running</span>
			</p>
		{:else}
			<ul class="mt-3 space-y-2" aria-label="Open incidents and maintenances">
				{#each items as { item, kind } (`${kind}-${item.id}`)}
					{@const label = state(item, kind)}
					<li class="flex gap-2">
						<span class="mt-1.5 size-2.5 shrink-0 rounded-full {dot(item, kind)}" aria-hidden="true"
						></span>
						<span class="min-w-0">
							<span class="block text-sm font-medium">{item.title}</span>
							<span class="block text-xs text-muted">{kind}{label ? ` · ${label}` : ''}</span>
						</span>
					</li>
				{/each}
			</ul>
		{/if}
		<p class="mt-3 text-xs text-muted">
			From Riot's status feed for {region.label}{checkedSeconds !== null
				? ` · checked ${formatAge(checkedSeconds)}`
				: ''}
		</p>
	{/if}
</section>
