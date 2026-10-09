<script lang="ts">
	import { onMount } from 'svelte';
	import { rememberSearch } from '#lib/recent-storage.ts';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	onMount(() => {
		rememberSearch({ region: data.region.slug, ...data.riotId });
	});
</script>

<svelte:head>
	<title>{data.riotId.gameName}#{data.riotId.tagLine} · {data.region.label}</title>
</svelte:head>

<h1 class="text-2xl font-semibold">
	{data.riotId.gameName}<span class="text-muted">#{data.riotId.tagLine}</span>
</h1>
<p class="mt-1 text-sm text-muted">{data.region.label}</p>
<p class="mt-6 text-muted">Rank and match history are coming soon.</p>
