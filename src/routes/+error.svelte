<script lang="ts">
	import { page } from '$app/state';
	import { PUBLIC_SITE_NAME } from '$app/env/public';
	import { describeError } from '#lib/domain/error-view.ts';

	const view = $derived(describeError(page.status, page.error?.retryAfter));
</script>

<svelte:head>
	<title>{view.title} · {PUBLIC_SITE_NAME}</title>
</svelte:head>

<h1 class="text-2xl font-semibold">{view.title}</h1>
<p class="mt-2 text-muted">{view.detail}</p>
<p class="mt-6"><a href="/" class="text-accent hover:underline">Back to search</a></p>
