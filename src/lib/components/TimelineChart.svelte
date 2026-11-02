<script lang="ts">
	import { onMount } from 'svelte';
	import type { Objective } from '#lib/api/match.ts';
	import type { TeamScoreboard } from '#lib/domain/match-detail.ts';
	import { formatDuration } from '#lib/domain/matches.ts';
	import {
		canChart,
		formatLead,
		goldAxis,
		goldLead,
		largestLeads,
		leadPaths,
		markerRows,
		minuteTicks,
		nearestFrame,
		objectiveMarkers,
		type GoldFrame,
		type ObjectiveKill
	} from '#lib/domain/timeline.ts';

	/**
	 * The first team's gold lead over the game, with each team's objectives on
	 * the same time axis underneath. Above zero is the first team (Blue) ahead.
	 * `gold` and `objectives` are null when the timeline could not be loaded.
	 */
	let {
		teams,
		gold,
		objectives
	}: {
		teams: Pick<TeamScoreboard, 'teamId' | 'name'>[];
		gold: GoldFrame[] | null;
		objectives: ObjectiveKill[] | null;
	} = $props();

	// The SVG is stretched to its box; lines keep their width (non-scaling-stroke).
	const WIDTH = 1000;
	const HEIGHT = 200;
	const MID = HEIGHT / 2;

	const points = $derived(gold ? goldLead(gold) : []);
	const last = $derived(points.at(-1));
	const duration = $derived(last?.at ?? 0);
	const axis = $derived(goldAxis(points));
	const paths = $derived(
		leadPaths(points, { width: WIDTH, height: HEIGHT, duration, limit: axis.limit })
	);
	const grid = $derived.by(() => {
		const lines: number[] = [];
		for (let g = -axis.limit; g <= axis.limit; g += axis.step) lines.push(g);
		return lines;
	});
	const ticks = $derived(minuteTicks(duration));
	const leads = $derived(largestLeads(points));
	// Each team's markers in its own lane under the chart. Markers within 5% of
	// the game of each other stack, so they don't overlap even on a phone.
	const lanes = $derived(
		teams.slice(0, 2).map((team) => {
			const own = objectiveMarkers(objectives ?? []).filter((m) => m.teamId === team.teamId);
			const rows = markerRows(
				own.map((m) => m.at),
				duration * 0.05
			);
			return {
				team,
				markers: own.map((m, i) => ({ ...m, row: rows[i] })),
				rows: Math.max(1, ...rows.map((r) => r + 1))
			};
		})
	);

	const SIDES = ['blue', 'red'] as const;
	const number = (n: number) => n.toLocaleString('en-GB');
	const x = (at: number) => (duration > 0 ? (Math.min(at, duration) / duration) * 100 : 0);
	const y = (lead: number) => (1 - (lead + axis.limit) / (2 * axis.limit)) * 100;
	const teamName = (teamId: number) => teams.find((t) => t.teamId === teamId)?.name ?? 'A team';
	const leadText = (lead: number) =>
		lead === 0 ? 'Even' : `${teams[lead > 0 ? 0 : 1].name} +${number(Math.abs(lead))}`;

	const GLYPHS: Record<Objective, string> = {
		tower: 'T',
		inhibitor: 'I',
		dragon: 'D',
		baron: 'B',
		riftHerald: 'H',
		horde: 'V'
	};
	const KEY = [
		['tower', 'Tower'],
		['inhibitor', 'Inhibitor'],
		['dragon', 'Dragon'],
		['baron', 'Baron'],
		['riftHerald', 'Herald'],
		['horde', 'Voidgrubs']
	] as const;

	// With JavaScript, pointing at the chart shows a crosshair on the nearest
	// frame in place of the per-frame <title> bands.
	let enhanced = $state(false);
	let hovered = $state(-1);
	const active = $derived(points[hovered]);
	onMount(() => {
		enhanced = true;
	});

	function point(event: PointerEvent) {
		const box = (event.currentTarget as HTMLElement).getBoundingClientRect();
		if (box.width === 0) return;
		hovered = nearestFrame(points, ((event.clientX - box.left) / box.width) * duration);
	}
</script>

{#snippet dot(p: { at: number; lead: number })}
	<span
		class="pointer-events-none absolute size-2.5 -translate-1/2 rounded-full ring-2 ring-surface {p.lead >=
		0
			? 'bg-team-blue'
			: 'bg-team-red'}"
		style:left="{x(p.at)}%"
		style:top="{y(Math.max(-axis.limit, Math.min(axis.limit, p.lead)))}%"
		aria-hidden="true"
	></span>
{/snippet}

<!-- One team's objective markers. Blue's rows stack up from the chart, Red's down.
     The fill is opaque so markers that touch on a narrow screen stay legible. -->
{#snippet lane(lane: (typeof lanes)[number] | undefined, side: (typeof SIDES)[number])}
	<span></span>
	<ul class="relative" style:height="{(lane?.rows ?? 1) * 1.25}rem" aria-hidden="true">
		{#each lane?.markers ?? [] as marker, j (j)}
			<li
				class="absolute flex h-4 min-w-4 -translate-x-1/2 items-center justify-center rounded px-0.5 text-[10px] font-semibold ring-1 ring-surface {side ===
				'blue'
					? 'bg-[color-mix(in_oklab,var(--color-team-blue)_25%,var(--color-surface))] text-team-blue'
					: 'bg-[color-mix(in_oklab,var(--color-team-red)_25%,var(--color-surface))] text-team-red'}"
				style:left="{x(marker.at)}%"
				style:top={side === 'red' ? `${marker.row * 1.25}rem` : undefined}
				style:bottom={side === 'blue' ? `${marker.row * 1.25}rem` : undefined}
				title="{formatDuration(marker.at)} · {marker.names.join(', ')}"
			>
				{GLYPHS[marker.kind]}{#if marker.names.length > 1}<sup class="font-normal"
						>{marker.names.length}</sup
					>{/if}
			</li>
		{/each}
	</ul>
	<span></span>
{/snippet}

<section aria-labelledby="timeline-heading" class="rounded border border-border bg-surface">
	<div class="flex flex-wrap items-baseline gap-x-4 gap-y-1 border-b border-border px-4 py-3">
		<h2 id="timeline-heading" class="font-semibold">Gold difference</h2>
		{#if points.length > 0}
			<ul class="flex gap-3 text-xs text-muted" aria-label="Key">
				{#each teams.slice(0, 2) as team, i (team.teamId)}
					<li class="flex items-center gap-1">
						<span
							class="size-2.5 rounded-sm {i === 0 ? 'bg-team-blue' : 'bg-team-red'}"
							aria-hidden="true"
						></span>
						{team.name} ahead {i === 0 ? '(above)' : '(below)'}
					</li>
				{/each}
			</ul>
		{/if}
	</div>

	<div class="px-4 py-4">
		{#if gold === null}
			<p class="text-sm text-muted">The timeline is unavailable right now.</p>
		{:else if points.length === 0}
			<p class="text-sm text-muted">Gold difference needs two teams.</p>
		{:else if !canChart(points)}
			<p class="text-sm text-muted">The timeline is too short to chart.</p>
		{:else}
			<p class="text-sm">
				{#each [leads.first, leads.second] as lead, i (i)}
					<span class="mr-4 inline-block">
						{teams[i].name}'s largest lead:
						{#if lead}
							<span class="font-semibold">+{number(Math.abs(lead.lead))}</span>
							<span class="text-muted">at {formatDuration(lead.at)}</span>
						{:else}
							<span class="text-muted">none</span>
						{/if}
					</span>
				{/each}
			</p>

			<!-- The chart, the objective lanes and the minute labels share one time axis.
			     Blue's objectives sit above the chart and Red's below, like their leads. -->
			<div class="mt-3 grid grid-cols-[3rem_minmax(0,1fr)_3rem] gap-y-1.5">
				{@render lane(lanes[0], 'blue')}

				<div class="relative" aria-hidden="true">
					{#each grid as g (g)}
						<span
							class="absolute right-2 -translate-y-1/2 text-[11px] text-muted tabular-nums"
							style:top="{y(g)}%">{formatLead(g)}</span
						>
					{/each}
				</div>
				<!-- svelte-ignore a11y_no_static_element_interactions -->
				<div
					class="relative"
					onpointermove={point}
					onpointerdown={point}
					onpointerleave={() => (hovered = -1)}
				>
					<svg
						viewBox="0 0 {WIDTH} {HEIGHT}"
						preserveAspectRatio="none"
						role="img"
						aria-label="Gold difference over {formatDuration(duration)}: {leadText(
							last?.lead ?? 0
						)} at the end"
						class="block h-44 w-full overflow-visible sm:h-56"
					>
						<defs>
							<clipPath id="gold-above"><rect width={WIDTH} height={MID} /></clipPath>
							<clipPath id="gold-below"><rect y={MID} width={WIDTH} height={MID} /></clipPath>
							<!-- Each side's area fades out towards zero. -->
							<linearGradient id="gold-fill-blue" gradientUnits="userSpaceOnUse" y2={MID} x2="0">
								<stop style:stop-color="var(--color-team-blue)" stop-opacity="0.5" />
								<stop offset="1" style:stop-color="var(--color-team-blue)" stop-opacity="0.04" />
							</linearGradient>
							<linearGradient
								id="gold-fill-red"
								gradientUnits="userSpaceOnUse"
								y1={MID}
								y2={HEIGHT}
								x2="0"
							>
								<stop style:stop-color="var(--color-team-red)" stop-opacity="0.04" />
								<stop offset="1" style:stop-color="var(--color-team-red)" stop-opacity="0.5" />
							</linearGradient>
						</defs>
						{#each ticks as m (m)}
							<line
								x1={(m * 60 * WIDTH) / duration}
								x2={(m * 60 * WIDTH) / duration}
								y2={HEIGHT}
								vector-effect="non-scaling-stroke"
								class="stroke-border/40"
							/>
						{/each}
						{#each grid as g (g)}
							<line
								y1={(y(g) * HEIGHT) / 100}
								x2={WIDTH}
								y2={(y(g) * HEIGHT) / 100}
								vector-effect="non-scaling-stroke"
								stroke-dasharray={g === 0 ? undefined : '3 4'}
								class={g === 0 ? 'stroke-muted/60' : 'stroke-border/70'}
							/>
						{/each}
						{#each SIDES as side (side)}
							<g clip-path="url(#gold-{side === 'blue' ? 'above' : 'below'})">
								<path d={paths.area} fill="url(#gold-fill-{side})" />
								<path
									d={paths.line}
									fill="none"
									stroke-width="2"
									stroke-linejoin="round"
									stroke-linecap="round"
									vector-effect="non-scaling-stroke"
									class={side === 'blue' ? 'stroke-team-blue' : 'stroke-team-red'}
								/>
							</g>
						{/each}
						<!-- Without JavaScript, one band per frame shows that minute's lead on hover. -->
						{#if !enhanced}
							{#each points as p, i (i)}
								{@const from = i === 0 ? 0 : (points[i - 1].at + p.at) / 2}
								{@const to = i === points.length - 1 ? duration : (p.at + points[i + 1].at) / 2}
								<rect
									x={(from / duration) * WIDTH}
									width={((to - from) / duration) * WIDTH}
									height={HEIGHT}
									class="fill-transparent hover:fill-text/5"
									><title>{formatDuration(p.at)} · {leadText(p.lead)}</title></rect
								>
							{/each}
						{/if}
					</svg>

					{#if last}
						{@render dot(last)}
					{/if}
					{#if active}
						<div
							class="pointer-events-none absolute inset-y-0 w-px bg-muted/50"
							style:left="{x(active.at)}%"
							aria-hidden="true"
						></div>
						{@render dot(active)}
						<div
							class="pointer-events-none absolute top-1 z-10 rounded border border-border bg-bg/95 px-2 py-1 text-xs whitespace-nowrap shadow-lg {x(
								active.at
							) > 60
								? '-ml-2 -translate-x-full'
								: 'ml-2'}"
							style:left="{x(active.at)}%"
							aria-hidden="true"
						>
							<div class="text-muted tabular-nums">{formatDuration(active.at)}</div>
							<div class="flex items-center gap-1.5 font-semibold">
								{#if active.lead !== 0}
									<span
										class="size-2 rounded-full {active.lead > 0 ? 'bg-team-blue' : 'bg-team-red'}"
									></span>
								{/if}
								{leadText(active.lead)}
							</div>
						</div>
					{/if}
				</div>
				<!-- The lead at the end, level with the line's last point. -->
				<div class="relative" aria-hidden="true">
					{#if last}
						<span
							class="absolute left-2 -translate-y-1/2 text-xs font-semibold tabular-nums"
							style:top="{y(Math.max(-axis.limit, Math.min(axis.limit, last.lead)))}%"
							>{formatLead(last.lead)}</span
						>
					{/if}
				</div>

				{@render lane(lanes[1], 'red')}

				<span></span>
				<div class="relative h-4" aria-hidden="true">
					{#each ticks as m (m)}
						<span
							class="absolute -translate-x-1/2 text-[11px] text-muted tabular-nums"
							style:left="{x(m * 60)}%">{m === 0 ? '0' : `${m}m`}</span
						>
					{/each}
				</div>
				<span></span>
			</div>

			<ul
				class="mt-3 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-muted sm:pl-12"
				aria-hidden="true"
			>
				{#each KEY as [kind, label] (kind)}
					<li class="flex items-center gap-1">
						<span
							class="flex size-4 items-center justify-center rounded bg-border/70 text-[10px] font-semibold text-text"
							>{GLYPHS[kind]}</span
						>
						{label}
					</li>
				{/each}
			</ul>
		{/if}

		{#if objectives && objectives.length > 0}
			<details class="mt-4 text-sm">
				<summary class="cursor-pointer text-muted hover:text-text">
					Objectives taken ({objectives.length})
				</summary>
				<table class="mt-2 w-full max-w-md text-left">
					<thead class="text-xs text-muted">
						<tr>
							<th scope="col" class="py-1 pr-4 font-medium">Time</th>
							<th scope="col" class="py-1 pr-4 font-medium">Team</th>
							<th scope="col" class="py-1 font-medium">Objective</th>
						</tr>
					</thead>
					<tbody class="divide-y divide-border">
						{#each objectives as kill, i (i)}
							<tr>
								<td class="py-1 pr-4 text-muted tabular-nums">{formatDuration(kill.at)}</td>
								<td class="py-1 pr-4">{teamName(kill.teamId)}</td>
								<td class="py-1">{kill.name}</td>
							</tr>
						{/each}
					</tbody>
				</table>
			</details>
		{/if}
	</div>
</section>
