<script lang="ts">
	import { onMount } from 'svelte';
	import { preloadData } from '$app/navigation';
	import { LANES, laneIconUrl } from '#lib/assets.ts';
	import { asMatchDetail, matchPath, type MatchDetail } from '#lib/domain/match-detail.ts';
	import { csPerMinute, formatDuration, kdaRatio, type MatchRow } from '#lib/domain/matches.ts';
	import ChampionIcon from './ChampionIcon.svelte';
	import ItemList from './ItemList.svelte';
	import Loadout from './Loadout.svelte';
	import MatchTeams from './MatchTeams.svelte';

	import type { RiotId } from '#lib/domain/riot-id.ts';

	/**
	 * `player` is the profile's Riot ID, for the link to the match page, which
	 * highlights that player.
	 */
	let { match, patch, player }: { match: MatchRow; patch: string; player: RiotId } = $props();

	const RESULT = {
		win: { label: 'Victory', border: 'border-l-win', text: 'text-win' },
		loss: { label: 'Defeat', border: 'border-l-loss', text: 'text-loss' },
		remake: { label: 'Remake', border: 'border-l-border', text: 'text-muted' }
	} as const;
	const result = $derived(RESULT[match.result]);
	// Icons as of this game's patch, when riot-proxy knows its Data Dragon version.
	const version = $derived(match.ddragonVersion ?? patch);
	const lane = $derived(match.position ? laneIconUrl(version, match.position) : undefined);
	const href = $derived(matchPath(match.matchId, { player }));

	// With JavaScript, a button shows both teams inside the row (ADR-030). Their
	// data is the match page's own load, run through SvelteKit's preloadData,
	// so the browser asks the site, never riot-proxy, and the answer is cached
	// like the match page. Without JavaScript there is only the Details link.
	let enhanced = $state(false);
	onMount(() => {
		enhanced = true;
	});
	let open = $state(false);
	let detail = $state<MatchDetail>();
	let failed = $state(false);
	const panelId = $derived(`teams-${match.matchId}`);

	async function toggle() {
		open = !open;
		if (!open || detail) return;
		failed = false;
		try {
			const result = await preloadData(href);
			detail =
				result.type === 'loaded' && result.status === 200
					? asMatchDetail(result.data, match.matchId)
					: undefined;
		} catch {
			detail = undefined;
		}
		failed = !detail;
	}
</script>

<article
	class="flex flex-wrap items-center gap-x-4 gap-y-3 rounded border border-l-4 border-border bg-surface px-4 py-3 {result.border}"
	aria-label="{result.label} as {match.champion.name}"
>
	<div class="w-28 text-sm">
		<p class="font-semibold {result.text}">{result.label}</p>
		<p class="text-muted">{match.queue}</p>
		<p class="text-xs text-muted">
			{[match.duration !== null && formatDuration(match.duration), match.playedAgo]
				.filter(Boolean)
				.join(' · ')}
		</p>
	</div>

	<div class="flex items-center gap-1.5">
		<!-- Champion with the lane on its lower-left corner and the level on its lower-right. -->
		<div class="relative">
			{#if match.champion.key}
				<ChampionIcon
					patch={version}
					id={match.champion.key}
					name={match.champion.name}
					size={56}
				/>
			{:else}
				<span class="block size-14 rounded bg-bg"></span>
			{/if}
			{#if lane && match.position}
				<img
					src={lane}
					alt={LANES[match.position]}
					title={LANES[match.position]}
					width="24"
					height="24"
					class="absolute -bottom-2 -left-2 size-6 rounded-full border border-border bg-bg p-0.5 brightness-110 grayscale"
				/>
			{/if}
			{#if match.champion.level !== null}
				<span
					title="Champion level {match.champion.level}"
					class="absolute -right-1.5 -bottom-1.5 min-w-5 rounded-full border border-border bg-bg px-1 text-center text-[11px] leading-[18px] font-semibold"
					><span class="sr-only">Level&nbsp;</span>{match.champion.level}</span
				>
			{/if}
		</div>
		<Loadout spells={match.spells} runes={match.runes} {version} />
	</div>

	<div class="w-28 text-sm">
		<p class="font-semibold">
			{match.kills} / <span class="text-loss">{match.deaths}</span> / {match.assists}
		</p>
		<p class="text-muted">{kdaRatio(match.kills, match.deaths, match.assists)} KDA</p>
		<p class="text-xs text-muted">
			{match.cs} CS{#if match.duration}{` (${csPerMinute(match.cs, match.duration)}/min)`}{/if}
		</p>
	</div>

	<!-- The items and the links wrap as one, so the links never sit alone on a
	     line of their own. A bot laner's eighth slot, the role quest item, is
	     the widest a build gets. -->
	<div class="flex flex-auto items-center gap-x-3">
		<ItemList items={match.items} roleBoundItem={match.roleBoundItem} {version} />

		<!-- Stacked, so the button doesn't push the row onto another line. -->
		<div class="ml-auto flex flex-col items-end gap-1">
			<a {href} class="text-sm text-muted underline-offset-4 hover:text-text hover:underline"
				>Details<span class="sr-only"> of this match</span></a
			>
			{#if enhanced}
				<button
					type="button"
					onclick={toggle}
					aria-expanded={open}
					aria-controls={open ? panelId : undefined}
					aria-label={open ? 'Hide the teams' : 'Show the teams'}
					title={open ? 'Hide the teams' : 'Show the teams'}
					class="rounded p-1 text-muted hover:bg-bg hover:text-text"
					><svg
						viewBox="0 0 16 16"
						width="16"
						height="16"
						aria-hidden="true"
						class="block {open ? 'rotate-180' : ''}"
						><path
							d="M4 6l4 4 4-4"
							fill="none"
							stroke="currentColor"
							stroke-width="1.5"
							stroke-linecap="round"
							stroke-linejoin="round"
						/></svg
					></button
				>
			{/if}
		</div>
	</div>

	{#if open}
		<div id={panelId} class="min-w-0 basis-full border-t border-border pt-3">
			{#if detail}
				<MatchTeams teams={detail.teams} version={detail.ddragonVersion} highlight={player} />
			{:else if failed}
				<p class="text-sm text-muted">
					The teams couldn't be loaded. <a {href} class="text-accent hover:underline"
						>Open the match page</a
					>
				</p>
			{:else}
				<p role="status" class="text-sm text-muted">Loading the teams…</p>
			{/if}
		</div>
	{/if}
</article>
