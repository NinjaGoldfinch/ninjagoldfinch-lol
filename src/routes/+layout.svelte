<script lang="ts">
	import '../app.css';
	import { PUBLIC_SITE_NAME } from '$app/env/public';
	import favicon from '#lib/assets/favicon.svg';
	import SearchForm from '#lib/components/SearchForm.svelte';
	import { LEGAL_NOTICE } from '#lib/legal.ts';
	import type { LayoutProps } from './$types';

	let { children }: LayoutProps = $props();
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
</svelte:head>

<div class="flex min-h-screen flex-col">
	<header class="border-b border-border bg-surface">
		<div
			class="mx-auto flex max-w-5xl flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:gap-6"
		>
			<a href="/" class="font-semibold text-accent">{PUBLIC_SITE_NAME}</a>
			<SearchForm />
		</div>
	</header>

	<main class="mx-auto w-full max-w-5xl flex-1 px-4 py-8">
		{@render children()}
	</main>

	<footer class="border-t border-border py-6 text-xs text-muted">
		<div class="mx-auto flex max-w-5xl flex-col gap-2 px-4">
			<nav><a href="/about" class="hover:text-text">About</a></nav>
			<p>{LEGAL_NOTICE}</p>
		</div>
	</footer>
</div>
