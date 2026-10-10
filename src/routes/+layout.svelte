<script lang="ts">
	import '../app.css';
	import { page } from '$app/state';
	import { PUBLIC_SITE_NAME } from '$app/env/public';
	import favicon from '#lib/assets/favicon.svg';
	import SearchForm from '#lib/components/SearchForm.svelte';
	import { findRegion } from '#lib/domain/regions.ts';
	import { LEGAL_NOTICE } from '#lib/legal.ts';
	import type { LayoutProps } from './$types';

	let { children }: LayoutProps = $props();

	// On a profile, the header search starts at that profile's region.
	const region = $derived(page.params.region && findRegion(page.params.region)?.slug);
	// Pages that have Data Dragon's names pass them on, so the search suggests champions.
	const champions = $derived(
		Array.isArray(page.data.championNames)
			? page.data.championNames.filter((n: unknown): n is string => typeof n === 'string')
			: []
	);
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
</svelte:head>

<div class="flex min-h-screen flex-col">
	<header class="border-b border-border bg-surface">
		<div
			class="mx-auto flex max-w-6xl flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:gap-6"
		>
			<div class="flex items-center gap-6">
				<a href="/" class="font-semibold text-accent">{PUBLIC_SITE_NAME}</a>
				<nav aria-label="Site">
					<a href="/champions" class="text-sm hover:text-accent">Champions</a>
				</nav>
			</div>
			<SearchForm region={region || undefined} {champions} />
		</div>
	</header>

	<main class="mx-auto w-full max-w-6xl flex-1 px-4 py-8">
		{@render children()}
	</main>

	<footer class="border-t border-border py-6 text-xs text-muted">
		<div class="mx-auto flex max-w-6xl flex-col gap-2 px-4">
			<nav><a href="/about" class="hover:text-text">About</a></nav>
			<p>{LEGAL_NOTICE}</p>
		</div>
	</footer>
</div>
