<script lang="ts">
	import type { TeamScoreboard } from '#lib/domain/match-detail.ts';
	import { profilePath, sameRiotId, type RiotId } from '#lib/domain/riot-id.ts';
	import ChampionIcon from './ChampionIcon.svelte';
	import ItemList from './ItemList.svelte';

	/**
	 * Both teams of a match, one short line per player: the profile's inline
	 * view of a match (ADR-030). The match page has the full scoreboard.
	 * `region` is the URL slug; `highlight` is whose line to mark.
	 */
	let {
		teams,
		version,
		region,
		highlight
	}: {
		teams: TeamScoreboard[];
		version: string;
		region: string;
		highlight: RiotId;
	} = $props();

	const RESULT = {
		win: { label: 'Victory', text: 'text-win' },
		loss: { label: 'Defeat', text: 'text-loss' },
		remake: { label: 'Remake', text: 'text-muted' }
	} as const;
	const maxDamage = $derived(Math.max(0, ...teams.flatMap((t) => t.players.map((p) => p.damage))));
	const number = (n: number) => n.toLocaleString('en-GB');
</script>

<!-- One table, so both teams' columns line up. Wide lines scroll inside it on narrow screens. -->
<div class="overflow-x-auto">
	<table class="w-full text-xs">
		{#each teams as team, t (team.teamId)}
			{@const result = RESULT[team.result]}
			<tbody aria-label="{result.label} · {team.name}">
				<tr>
					<th scope="rowgroup" colspan="4" class="pb-1 text-left font-normal {t > 0 ? 'pt-3' : ''}">
						<span class="font-semibold {result.text}">{result.label}</span>
						<span class="text-muted">· {team.name} ·</span>
						{team.kills} / {team.deaths} / {team.assists}
					</th>
				</tr>
				{#each team.players as player, i (i)}
					{@const own = !!player.riotId && sameRiotId(player.riotId, highlight)}
					<tr
						aria-label={player.champion.name}
						aria-current={own ? 'true' : undefined}
						class={own ? 'bg-accent/10 shadow-[inset_3px_0_0_var(--color-accent)]' : ''}
					>
						<td class="py-0.5 pr-2 pl-1.5">
							<div class="flex items-center gap-2">
								{#if player.champion.key}
									<ChampionIcon
										patch={version}
										id={player.champion.key}
										name={player.champion.name}
										size={22}
									/>
								{:else}
									<span class="block size-[22px] shrink-0 rounded bg-bg"></span>
								{/if}
								{#if player.riotId}
									<a
										href={profilePath(region, player.riotId)}
										class="block max-w-36 truncate hover:underline"
										>{player.riotId.gameName}<span class="text-muted">#{player.riotId.tagLine}</span
										></a
									>
								{:else}
									<span class="text-muted">Unknown player</span>
								{/if}
							</div>
						</td>
						<td class="px-2 py-0.5 whitespace-nowrap">
							{player.kills} / <span class="text-loss">{player.deaths}</span> / {player.assists}
						</td>
						<td class="px-2 py-0.5" title="{number(player.damage)} damage to champions">
							<span class="sr-only">{number(player.damage)} damage</span>
							<div class="h-1 w-14 rounded-full bg-bg" aria-hidden="true">
								<div
									class="h-1 rounded-full bg-muted"
									style:width="{maxDamage > 0 ? (player.damage / maxDamage) * 100 : 0}%"
								></div>
							</div>
						</td>
						<!-- Full-size icons: the table scrolls rather than squeezing them. -->
						<td class="py-0.5 pl-2 [&_ul]:w-max">
							<ItemList
								items={player.items}
								roleBoundItem={player.roleBoundItem}
								{version}
								size={20}
							/>
						</td>
					</tr>
				{/each}
			</tbody>
		{/each}
	</table>
</div>
