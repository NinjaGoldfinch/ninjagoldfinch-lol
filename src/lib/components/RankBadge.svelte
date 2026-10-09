<script lang="ts">
	import type { RankView } from '#lib/domain/ranks.ts';

	let { rank }: { rank: RankView } = $props();
</script>

<div class="rounded border border-border bg-surface px-4 py-3">
	<p class="text-xs tracking-wide text-muted uppercase">{rank.queue}</p>
	<p class="mt-1 text-lg font-semibold">
		{rank.tier} <span class="text-sm font-normal text-muted">{rank.leaguePoints} LP</span>
	</p>
	<p class="text-sm text-muted">
		{rank.wins}W {rank.losses}L · <span class="text-text">{rank.winRate}%</span>
	</p>
</div>
