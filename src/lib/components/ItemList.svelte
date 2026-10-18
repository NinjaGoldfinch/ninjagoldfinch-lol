<script lang="ts">
	import { itemIconUrl } from '#lib/assets.ts';
	import { itemSlots, type MatchRow } from '#lib/domain/matches.ts';

	let {
		items,
		roleBoundItem,
		version,
		size = 34
	}: Pick<MatchRow, 'items' | 'roleBoundItem'> & { version: string; size?: number } = $props();

	const slots = $derived(itemSlots({ items, roleBoundItem }));
</script>

<ul class="flex shrink-0 gap-1" aria-label="Items">
	<!-- Inventory packed left, then the trinket, then the role quest slot. -->
	{#each slots as item, i (i)}
		<li>
			{#if item}
				<img
					src={itemIconUrl(version, item.id)}
					alt={item.name}
					title={item.roleQuest ? `Role quest: ${item.name}` : item.name}
					width={size}
					height={size}
					loading="lazy"
					class="rounded-sm"
				/>
			{:else}
				<span class="block rounded-sm bg-bg" style:width="{size}px" style:height="{size}px"></span>
			{/if}
		</li>
	{/each}
</ul>
