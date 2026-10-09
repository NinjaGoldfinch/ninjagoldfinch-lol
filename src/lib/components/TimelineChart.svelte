<script lang="ts">
	import type { Objective } from '#lib/api/match.ts';
	import type { TeamScoreboard } from '#lib/domain/match-detail.ts';
	import { formatDuration } from '#lib/domain/matches.ts';
	import {
		formatLead,
		goldAxis,
		goldLead,
		largestLeads,
		leadPaths,
		markerRows,
		minuteTicks,
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
	const duration = $derived(points.at(-1)?.at ?? 0);
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
	const KEY = (
		[
			['tower', 'tower'],
			['inhibitor', 'inhibitor'],
			['dragon', 'dragon'],
			['baron', 'Baron'],
			['riftHerald', 'Herald'],
			['horde', 'voidgrubs']
		] as const
	)
		.map(([kind, label]) => `${GLYPHS[kind]} ${label}`)
		.join(', ');
</script>

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

			<!-- The chart, the objective lanes and the minute labels share one time axis. -->
			<div class="mt-3 grid grid-cols-[3rem_minmax(0,1fr)] gap-y-1">
				<div class="relative" aria-hidden="true">
					{#each grid as g (g)}
						<span
							class="absolute right-2 -translate-y-1/2 text-[10px] text-muted"
							style:top="{y(g)}%">{formatLead(g)}</span
						>
					{/each}
				</div>
				<svg
					viewBox="0 0 {WIDTH} {HEIGHT}"
					preserveAspectRatio="none"
					role="img"
					aria-label="Gold difference over {formatDuration(duration)}: {leadText(
						points.at(-1)?.lead ?? 0
					)} at the end"
					class="block h-44 w-full overflow-visible sm:h-56"
				>
					<defs>
						<clipPath id="gold-above"><rect width={WIDTH} height={MID} /></clipPath>
						<clipPath id="gold-below"><rect y={MID} width={WIDTH} height={MID} /></clipPath>
					</defs>
					{#each ticks as m (m)}
						<line
							x1={(m * 60 * WIDTH) / duration}
							x2={(m * 60 * WIDTH) / duration}
							y2={HEIGHT}
							vector-effect="non-scaling-stroke"
							class="stroke-border/50"
						/>
					{/each}
					{#each grid as g (g)}
						<line
							y1={(y(g) * HEIGHT) / 100}
							x2={WIDTH}
							y2={(y(g) * HEIGHT) / 100}
							vector-effect="non-scaling-stroke"
							class={g === 0 ? 'stroke-muted' : 'stroke-border/50'}
						/>
					{/each}
					{#each SIDES as side (side)}
						<g clip-path="url(#gold-{side === 'blue' ? 'above' : 'below'})">
							<path
								d={paths.area}
								class={side === 'blue' ? 'fill-team-blue/25' : 'fill-team-red/25'}
							/>
							<path
								d={paths.line}
								fill="none"
								stroke-width="2"
								stroke-linejoin="round"
								vector-effect="non-scaling-stroke"
								class={side === 'blue' ? 'stroke-team-blue' : 'stroke-team-red'}
							/>
						</g>
					{/each}
					<!-- One band per frame, so hovering shows that minute's lead without JavaScript. -->
					{#each points as p, i (i)}
						{@const from = i === 0 ? 0 : (points[i - 1].at + p.at) / 2}
						{@const to = i === points.length - 1 ? duration : (p.at + points[i + 1].at) / 2}
						<rect
							x={(from / duration) * WIDTH}
							width={((to - from) / duration) * WIDTH}
							height={HEIGHT}
							fill="transparent"><title>{formatDuration(p.at)} · {leadText(p.lead)}</title></rect
						>
					{/each}
				</svg>

				{#each lanes as lane, i (lane.team.teamId)}
					<span class="self-center pr-2 text-right text-[10px] text-muted" aria-hidden="true"
						>{lane.team.name.replace(/ team$/, '')}</span
					>
					<ul class="relative" style:height="{lane.rows * 1.25}rem" aria-hidden="true">
						{#each lane.markers as marker, j (j)}
							<li
								class="absolute flex h-4 min-w-4 -translate-x-1/2 items-center justify-center rounded px-0.5 text-[10px] font-semibold {i ===
								0
									? 'bg-team-blue/25 text-team-blue'
									: 'bg-team-red/25 text-team-red'}"
								style:left="{x(marker.at)}%"
								style:top="{marker.row * 1.25}rem"
								title="{formatDuration(marker.at)} · {marker.names.join(', ')}"
							>
								{GLYPHS[marker.kind]}{#if marker.names.length > 1}<sup class="font-normal"
										>{marker.names.length}</sup
									>{/if}
							</li>
						{/each}
					</ul>
				{/each}

				<span></span>
				<div class="relative h-4" aria-hidden="true">
					{#each ticks as m (m)}
						<span class="absolute -translate-x-1/2 text-[10px] text-muted" style:left="{x(m * 60)}%"
							>{m}</span
						>
					{/each}
				</div>
			</div>
			<p class="mt-1 text-right text-[10px] text-muted" aria-hidden="true">Minutes · {KEY}</p>
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
