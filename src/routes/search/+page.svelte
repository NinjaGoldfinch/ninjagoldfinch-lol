<script lang="ts">
	import SearchForm from '#lib/components/SearchForm.svelte';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
</script>

<svelte:head>
	<title>Search</title>
</svelte:head>

<h1 class="text-2xl font-semibold">Search for a player</h1>
<p class="mt-2 text-muted">
	Enter a Riot ID as <span class="text-text">Game name#TAG</span>, for example
	<span class="text-text">Hide on bush#KR1</span>.
</p>
<div class="mt-6 max-w-xl">
	<SearchForm region={data.region} riotId={data.riotId} />
</div>
