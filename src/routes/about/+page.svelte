<script lang="ts">
	import { PUBLIC_SITE_NAME } from '$app/env/public';
	import { LEGAL_NOTICE } from '#lib/legal.ts';
</script>

<svelte:head>
	<title>About · {PUBLIC_SITE_NAME}</title>
</svelte:head>

<article class="max-w-2xl space-y-4">
	<h1 class="text-2xl font-semibold">About {PUBLIC_SITE_NAME}</h1>
	<p>
		{PUBLIC_SITE_NAME} shows League of Legends player and champion statistics from Riot Games' public
		API.
	</p>
	<h2 class="pt-2 text-lg font-semibold">How fresh is the data?</h2>
	<p class="text-muted">
		Player data is fetched from Riot when you open a page and cached briefly, so a profile can be up
		to a few minutes old. Finished matches never change and are cached for longer.
	</p>
	<h2 class="pt-2 text-lg font-semibold">Legal</h2>
	<p class="text-muted">{LEGAL_NOTICE}</p>
</article>
