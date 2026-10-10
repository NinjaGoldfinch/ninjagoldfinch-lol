<script lang="ts">
	import { LOW_SAMPLE_GAMES } from '#lib/domain/champion-stats.ts';
</script>

<!-- Marks a rate over too few games to trust. ADR-035. -->
<span
	title="Fewer than {LOW_SAMPLE_GAMES} games: these rates can swing widely"
	class="ml-1 inline-block rounded border border-border px-1 align-middle text-[10px] leading-4 font-normal whitespace-nowrap text-muted"
	>Low sample</span
>
