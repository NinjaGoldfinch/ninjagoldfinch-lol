<script lang="ts">
	import { PUBLIC_SITE_NAME } from '$app/env/public';
	import RecentSearches from '#lib/components/RecentSearches.svelte';
	import SearchForm from '#lib/components/SearchForm.svelte';
</script>

<svelte:head>
	<title>{PUBLIC_SITE_NAME}: League of Legends stats</title>
</svelte:head>

<h1 class="text-3xl font-semibold">League of Legends player stats</h1>
<p class="mt-2 text-muted">Look up any player by Riot ID, or a champion's builds by name.</p>
<div class="mt-6 max-w-xl">
	<SearchForm />
</div>

<RecentSearches />
