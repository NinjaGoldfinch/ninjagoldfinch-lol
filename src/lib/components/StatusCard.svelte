<script lang="ts">
	import RegionPicker from '#lib/components/RegionPicker.svelte';
	import { formatAge } from '#lib/domain/age.ts';
	import {
		allRunning,
		statusHeadline,
		type StatusEntry,
		type StatusTone,
		type StatusView
	} from '#lib/domain/front-page.ts';

	/**
	 * Riot's status feed for a region: what is open, worst first, each with its
	 * newest update, and a link to Riot's own status page (ADR-071, ADR-075).
	 */
	let {
		status,
		statusPage,
		checkedSeconds,
		region,
		keep = []
	}: {
		/** null when riot-proxy's status was unavailable or unreadable. */
		status: StatusView | null;
		/** Riot's own status page for the region. */
		statusPage: string;
		/** Seconds since riot-proxy read the feed from Riot, when it said. */
		checkedSeconds: number | null;
		region: { slug: string; label: string };
		/** The page's other controls' fields, kept by the region picker. */
		keep?: [string, string][];
	} = $props();

	const id = $props.id();

	const DOT: Record<StatusTone, string> = {
		critical: 'bg-loss',
		warning: 'bg-warn',
		info: 'bg-muted',
		maintenance: 'bg-accent'
	};

	/** `Incident · warning · updated 3 hours ago`, with the parts the entry has. */
	function detail(entry: StatusEntry): string {
		return [
			entry.kind,
			...(entry.state ? [entry.state] : []),
			...(entry.age ? [`${entry.age.event} ${formatAge(entry.age.seconds)}`] : [])
		].join(' · ');
	}
</script>

<section aria-labelledby={id} class="flex flex-col rounded-lg border border-border bg-surface p-4">
	<div class="flex items-center justify-between gap-2">
		<h2 {id} class="text-xs font-medium tracking-wide text-muted uppercase">Server status</h2>
		<RegionPicker {region} {keep} />
	</div>
	{#if status === null}
		<p class="mt-3 text-sm text-muted">Server status is unavailable right now.</p>
	{:else if allRunning(status)}
		<div class="flex grow flex-col items-center justify-center py-6 text-center">
			<span
				class="flex size-10 items-center justify-center rounded-full bg-ok/15"
				aria-hidden="true"
			>
				<span class="size-3 rounded-full bg-ok"></span>
			</span>
			<p class="mt-3 text-sm font-medium">{statusHeadline(status)}</p>
			<p class="mt-1 text-xs text-muted">No open incidents or maintenance on {region.label}.</p>
		</div>
	{:else}
		{@const worst = status.entries[0]}
		<p class="mt-3 flex items-center gap-2">
			{#if worst}
				<span class="size-2.5 shrink-0 rounded-full {DOT[worst.tone]}" aria-hidden="true"></span>
			{/if}
			<span class="text-sm font-medium">{statusHeadline(status)}</span>
		</p>
		<ul
			class="mt-3 space-y-3 border-t border-border pt-3"
			aria-label="Open incidents and maintenances"
		>
			{#each status.entries as entry (entry.key)}
				<li class="flex gap-2">
					<span class="mt-1.5 size-2 shrink-0 rounded-full {DOT[entry.tone]}" aria-hidden="true"
					></span>
					<span class="min-w-0">
						<span class="block text-sm font-medium">{entry.title}</span>
						<span class="block text-xs text-muted">{detail(entry)}</span>
						{#if entry.update !== null}
							<span class="mt-1 line-clamp-3 text-xs">{entry.update}</span>
						{/if}
					</span>
				</li>
			{/each}
		</ul>
	{/if}
	<div class="mt-auto pt-3">
		{#if status !== null}
			<p class="text-xs text-muted">
				From Riot's status feed for {region.label}{checkedSeconds !== null
					? ` · checked ${formatAge(checkedSeconds)}`
					: ''}
			</p>
		{/if}
		<a
			href={statusPage}
			rel="external noreferrer"
			class="mt-2 inline-block text-sm text-accent hover:underline">Riot's status page →</a
		>
	</div>
</section>
