<script lang="ts">
	import { LANES } from '#lib/assets.ts';
	import type { TeamScoreboard } from '#lib/domain/match-detail.ts';
	import { profilePath, sameRiotId, type RiotId } from '#lib/domain/riot-id.ts';
	import ChampionIcon from './ChampionIcon.svelte';
	import ItemList from './ItemList.svelte';
	import Loadout from './Loadout.svelte';

	/**
	 * `region` is the URL slug; `maxDamage` is the match's highest, for the bars;
	 * `highlight` is whose line to mark, if anyone's. Each champion links to
	 * `buildHref` for that player's build, and `onbuild` may open it in place
	 * instead; `selected` is whose build is open.
	 */
	let {
		team,
		version,
		region,
		maxDamage,
		highlight = null,
		selected = null,
		buildHref,
		onbuild
	}: {
		team: TeamScoreboard;
		version: string;
		region: string;
		maxDamage: number;
		highlight?: RiotId | null;
		selected?: number | null;
		buildHref: (participantId: number) => string;
		onbuild?: (participantId: number, event: MouseEvent) => void;
	} = $props();

	const RESULT = {
		win: { label: 'Victory', text: 'text-win' },
		loss: { label: 'Defeat', text: 'text-loss' },
		remake: { label: 'Remake', text: 'text-muted' }
	} as const;
	const result = $derived(RESULT[team.result]);
	const OBJECTIVE_NAMES = [
		['tower', 'Towers'],
		['inhibitor', 'Inhibitors'],
		['dragon', 'Dragons'],
		['baron', 'Barons'],
		['riftHerald', 'Herald'],
		['horde', 'Voidgrubs']
	] as const;
	const number = (n: number) => n.toLocaleString('en-GB');
	const headingId = $derived(`team-${team.teamId}`);
</script>

<section aria-labelledby={headingId} class="rounded border border-border bg-surface">
	<div class="flex flex-wrap items-baseline gap-x-4 gap-y-1 border-b border-border px-4 py-3">
		<h2 id={headingId} class="font-semibold">
			<span class={result.text}>{result.label}</span>
			<span class="text-muted">· {team.name}</span>
		</h2>
		<p class="text-sm">
			{team.kills} / {team.deaths} / {team.assists}
			<span class="text-muted">· {number(team.gold)} gold</span>
		</p>
		<ul class="flex flex-wrap gap-x-3 text-xs text-muted" aria-label="Objectives">
			{#each OBJECTIVE_NAMES as [key, label] (key)}
				<li>{label} <span class="text-text">{team.objectives[key]}</span></li>
			{/each}
		</ul>
		{#if team.bans.length > 0}
			<ul class="flex gap-1 sm:ml-auto" aria-label="Bans">
				{#each team.bans as ban, i (i)}
					<li class="opacity-60 grayscale">
						{#if ban.key}
							<ChampionIcon patch={version} id={ban.key} name={ban.name} size={20} />
						{:else}
							<span class="block size-5 rounded bg-bg" title={ban.name}></span>
						{/if}
					</li>
				{/each}
			</ul>
		{/if}
	</div>

	<!-- Wide tables scroll inside their box on narrow screens, not the page. -->
	<div class="overflow-x-auto">
		<table class="w-full text-sm">
			<thead class="text-left text-xs text-muted">
				<tr>
					<th scope="col" class="px-4 py-2 font-medium">Player</th>
					<th scope="col" class="px-2 py-2 font-medium">KDA</th>
					<th scope="col" class="px-2 py-2 font-medium">Damage</th>
					<th scope="col" class="px-2 py-2 text-right font-medium">Gold</th>
					<th scope="col" class="px-2 py-2 text-right font-medium">CS</th>
					<th scope="col" class="px-2 py-2 text-right font-medium">Vision</th>
					<th scope="col" class="px-4 py-2 font-medium">Items</th>
				</tr>
			</thead>
			<tbody class="divide-y divide-border">
				{#each team.players as player, i (i)}
					{@const own = !!highlight && !!player.riotId && sameRiotId(player.riotId, highlight)}
					<tr
						aria-label={player.champion.name}
						aria-current={own ? 'true' : undefined}
						class={own ? 'bg-accent/10 shadow-[inset_3px_0_0_var(--color-accent)]' : ''}
					>
						<td class="px-4 py-2">
							<div class="flex items-center gap-2">
								<a
									href={buildHref(player.participantId)}
									onclick={(event) => onbuild?.(player.participantId, event)}
									aria-label="Show {player.champion.name}'s build"
									title="Show build"
									class="relative block shrink-0 rounded {player.participantId === selected
										? 'ring-2 ring-accent'
										: 'hover:ring-2 hover:ring-border'}"
								>
									{#if player.champion.key}
										<ChampionIcon
											patch={version}
											id={player.champion.key}
											name={player.champion.name}
											size={36}
										/>
									{:else}
										<span class="block size-9 rounded bg-bg"></span>
									{/if}
									{#if player.champion.level !== null}
										<span
											title="Champion level {player.champion.level}"
											class="absolute -right-1 -bottom-1 min-w-4 rounded-full border border-border bg-bg px-0.5 text-center text-[10px] leading-[14px] font-semibold"
											><span class="sr-only">Level&nbsp;</span>{player.champion.level}</span
										>
									{/if}
								</a>
								<div class="flex shrink-0 gap-0.5">
									<Loadout spells={player.spells} runes={player.runes} {version} size={16} />
								</div>
								<div class="min-w-0">
									{#if player.riotId}
										<a
											href={profilePath(region, player.riotId)}
											class="block max-w-40 truncate hover:underline"
											>{player.riotId.gameName}<span class="text-muted"
												>#{player.riotId.tagLine}</span
											></a
										>
									{:else}
										<span class="text-muted">Unknown player</span>
									{/if}
									{#if player.position && LANES[player.position]}
										<p class="text-xs text-muted">{LANES[player.position]}</p>
									{/if}
								</div>
							</div>
						</td>
						<td class="px-2 py-2 whitespace-nowrap">
							{player.kills} / <span class="text-loss">{player.deaths}</span> / {player.assists}
						</td>
						<td class="px-2 py-2">
							<p>{number(player.damage)}</p>
							<div class="mt-1 h-1 w-16 rounded-full bg-bg" aria-hidden="true">
								<div
									class="h-1 rounded-full bg-muted"
									style:width="{maxDamage > 0 ? (player.damage / maxDamage) * 100 : 0}%"
								></div>
							</div>
						</td>
						<td class="px-2 py-2 text-right">{number(player.gold)}</td>
						<td class="px-2 py-2 text-right">{player.cs}</td>
						<td class="px-2 py-2 text-right">{player.vision}</td>
						<td class="px-4 py-2">
							<ItemList
								items={player.items}
								roleBoundItem={player.roleBoundItem}
								{version}
								size={24}
							/>
						</td>
					</tr>
				{/each}
			</tbody>
		</table>
	</div>
</section>
