<script lang="ts">
	import { DDRAGON_ORIGIN } from '#lib/assets.ts';
	import '../app.css';
	import { page } from '$app/state';
	import { PUBLIC_SITE_NAME } from '$app/env/public';
	import favicon from '#lib/assets/favicon.svg';
	import SearchForm from '#lib/components/SearchForm.svelte';
	import { LEGAL_NOTICE } from '#lib/legal.ts';
	import type { LayoutProps } from './$types';

	let { children }: LayoutProps = $props();

	// Pages that have Data Dragon's names pass them on, so the search suggests champions.
	const champions = $derived(
		Array.isArray(page.data.championNames)
			? page.data.championNames.filter((n: unknown): n is string => typeof n === 'string')
			: []
	);

	// Marks the document once hydrated, when the enhancements (filters that apply
	// on change, popups) are wired up. The browser tests wait for it before using them.
	$effect(() => {
		document.documentElement.dataset.hydrated = '';
	});
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
	<link rel="preconnect" href={DDRAGON_ORIGIN} />
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
			<SearchForm {champions} />
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
