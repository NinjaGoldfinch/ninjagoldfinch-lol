<script lang="ts">
	import { itemIconUrl } from '#lib/assets.ts';

	/** An item's icon, named; repeats show their count on the corner. */
	let {
		version,
		item,
		count = 1,
		size = 28
	}: {
		version: string;
		item: { id: number; name: string };
		count?: number;
		size?: number;
	} = $props();

	const name = $derived(`${count > 1 ? `${count} × ` : ''}${item.name}`);
</script>

<span class="relative block shrink-0">
	<img
		src={itemIconUrl(version, item.id)}
		alt={name}
		title={name}
		width={size}
		height={size}
		loading="lazy"
		class="rounded-sm bg-bg"
	/>
	{#if count > 1}
		<span
			aria-hidden="true"
			class="absolute -right-1 -bottom-1 min-w-4 rounded-full border border-border bg-bg px-0.5 text-center text-[10px] leading-[14px] font-semibold"
			>{count}</span
		>
	{/if}
</span>
