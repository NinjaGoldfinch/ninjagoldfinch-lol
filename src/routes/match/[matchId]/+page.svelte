<script lang="ts">
	import { afterNavigate, goto } from '$app/navigation';
	import { page } from '$app/state';
	import BuildPanel from '#lib/components/BuildPanel.svelte';
	import Scoreboard from '#lib/components/Scoreboard.svelte';
	import TimelineChart from '#lib/components/TimelineChart.svelte';
	import {
		formatMatchDate,
		matchPath,
		matchTab,
		mostDamage,
		openBuildId,
		selectBuild,
		type MatchTab
	} from '#lib/domain/match-detail.ts';
	import { formatDuration } from '#lib/domain/matches.ts';
	import { parseRiotId, profilePath, sameRiotId } from '#lib/domain/riot-id.ts';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	const facts = $derived(
		[
			data.duration !== null && formatDuration(data.duration),
			data.patch && `Patch ${data.patch}`,
			data.startedAt !== null && formatMatchDate(data.startedAt),
			data.region.label
		].filter(Boolean)
	);
	// `?player=GameName-TAG`: whose champion to highlight, set by profile links.
	// Read here, not in the load, so the load's data is the same for everyone.
	const highlight = $derived(parseRiotId(page.url.searchParams.get('player') ?? '') ?? null);

	// Back to the profile the visitor came from. Without JavaScript that is the
	// `player`'s profile. With it, a match opened from a profile page goes back
	// through history, so that page's filters, page number and scroll return.
	let cameFrom = $state<string | null>(null);
	afterNavigate(({ from, to }) => {
		// Switching whose build is shown stays on this match; keep where we came from.
		if (from && from.url.pathname === to?.url.pathname) return;
		cameFrom = from?.url.pathname.startsWith('/summoner/')
			? from.url.pathname + from.url.search
			: null;
	});
	const back = $derived(cameFrom ?? (highlight ? profilePath(highlight) : null));

	// `?tab=timeline` shows the charts in place of the scoreboard. The tab links
	// are plain links. The load doesn't read the URL, so with JavaScript switching
	// tab fetches nothing, and it replaces the history entry so that the back
	// link's history.back() still leaves the match.
	const tab = $derived(matchTab(page.url.searchParams.get('tab')));
	const TABS: { id: MatchTab; label: string }[] = [
		{ id: 'scoreboard', label: 'Scoreboard' },
		{ id: 'timeline', label: 'Timeline' }
	];
	const tabHref = (id: MatchTab) => matchPath(data.matchId, { player: highlight, tab: id });
	function goBack(event: MouseEvent) {
		if (!cameFrom || event.metaKey || event.ctrlKey || event.shiftKey || event.button !== 0) return;
		event.preventDefault();
		history.back();
	}

	// A build opens in a popup over the scoreboard (ADR-028). `?build=<id>` in
	// the URL asks for one. Without JavaScript the page renders it below the
	// scoreboard, and the champion links load that URL. With it, they open the
	// popup in place through shallow routing: the URL changes, and Back closes it.
	const lines = $derived(data.teams.flatMap((t) => t.players));
	const openId = $derived(openBuildId(page.state.build, page.url.searchParams.get('build')));
	const build = $derived(openId === null ? undefined : selectBuild(data, openId, highlight));
	const buildLine = $derived(lines.find((l) => l.participantId === build?.participantId));
	const buildHref = (participantId: number) =>
		`${matchPath(data.matchId, { player: highlight, tab, build: participantId })}#build`;
	const closeHref = $derived(matchPath(data.matchId, { player: highlight, tab }));

	// The header's build link: the highlighted player's, else the first player's.
	const firstBuild = $derived(selectBuild(data, null, highlight));
	const own = $derived(
		lines.some(
			(l) =>
				l.participantId === firstBuild?.participantId &&
				!!l.riotId &&
				!!highlight &&
				sameRiotId(l.riotId, highlight)
		)
	);

	function openBuild(participantId: number, event: MouseEvent) {
		if (event.metaKey || event.ctrlKey || event.shiftKey || event.button !== 0) return;
		event.preventDefault();
		goto(buildHref(participantId), { state: { build: participantId }, shallow: true });
	}

	function closeBuild() {
		// Opened by a click here: step back over the entry it added. Opened by
		// loading a `?build=` URL: replace it with the page without the build.
		if (page.state.build != null) history.back();
		else goto(closeHref, { state: { build: null }, shallow: true, replace: true });
	}

	// The server renders the build as an open, non-modal dialog, which shows in
	// the page without JavaScript. In the browser it becomes a modal popup.
	let dialog = $state<HTMLDialogElement>();
	let upgrading = false;
	$effect(() => {
		if (!dialog || dialog.matches(':modal')) return;
		upgrading = true;
		dialog.close();
		dialog.showModal();
	});
	function onDialogClose() {
		// The close() above, while upgrading, is not the visitor closing it.
		if (upgrading) {
			upgrading = false;
			return;
		}
		if (openId !== null) closeBuild();
	}
	function closeFromBackdrop(event: MouseEvent) {
		if (event.target === dialog) dialog?.close();
	}

	const maxDamage = $derived(mostDamage(data.teams));
</script>

<svelte:head>
	<title>{data.queue} · {data.matchId}</title>
</svelte:head>

<header>
	{#if back}
		<a
			href={back}
			onclick={goBack}
			class="mb-3 inline-flex items-center gap-1 text-sm text-muted hover:text-text hover:underline"
			><span aria-hidden="true">←</span>
			{highlight ? `Back to ${highlight.gameName}#${highlight.tagLine}` : 'Back to profile'}</a
		>
	{/if}
	<h1 class="text-2xl font-semibold">{data.queue}</h1>
	<div class="mt-1 flex flex-wrap items-baseline gap-x-4 gap-y-1">
		<p class="text-sm text-muted">{facts.join(' · ')}</p>
		{#if firstBuild}
			<a
				href={buildHref(firstBuild.participantId)}
				onclick={(event) => openBuild(firstBuild.participantId, event)}
				class="text-sm text-accent hover:underline">{own ? 'Your build' : 'Builds'}</a
			>
		{/if}
	</div>
</header>

<nav aria-label="Match views" class="mt-5 flex gap-1 border-b border-border">
	{#each TABS as t (t.id)}
		<a
			href={tabHref(t.id)}
			aria-current={tab === t.id ? 'page' : undefined}
			data-sveltekit-replacestate
			data-sveltekit-reset="false"
			class="-mb-px border-b-2 px-3 py-2 text-sm {tab === t.id
				? 'border-accent text-text'
				: 'border-transparent text-muted hover:text-text'}">{t.label}</a
		>
	{/each}
</nav>

<div class="mt-4 flex flex-col gap-6">
	{#if tab === 'timeline'}
		<TimelineChart teams={data.teams} gold={data.gold} objectives={data.objectives} />
	{:else}
		{#each data.teams as team (team.teamId)}
			<Scoreboard
				{team}
				version={data.ddragonVersion}
				{maxDamage}
				{highlight}
				selected={build?.participantId ?? null}
				{buildHref}
				onbuild={openBuild}
			/>
		{/each}
	{/if}
	{#if build && buildLine}
		<!-- In the page without JavaScript (`static`); a popup once modal. -->
		<dialog
			bind:this={dialog}
			open
			id="build"
			aria-labelledby="build-heading"
			onclose={onDialogClose}
			onclick={closeFromBackdrop}
			class="static m-0 w-full max-w-none scroll-mt-4 border-0 bg-transparent p-0 text-text backdrop:bg-bg/75 [&:modal]:fixed [&:modal]:inset-0 [&:modal]:m-auto [&:modal]:h-fit [&:modal]:max-h-[calc(100dvh-2rem)] [&:modal]:w-[min(60rem,calc(100vw-2rem))] [&:modal]:overflow-y-auto [&:modal]:rounded [&:modal]:shadow-2xl"
		>
			<BuildPanel
				{build}
				line={buildLine}
				version={data.ddragonVersion}
				{closeHref}
				onclose={(event) => {
					event.preventDefault();
					dialog?.close();
				}}
			/>
		</dialog>
	{/if}
</div>
