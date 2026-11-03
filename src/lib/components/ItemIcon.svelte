<script lang="ts">
	import { itemIconUrl } from '#lib/assets.ts';

	/**
	 * An item's icon, named; repeats show their count on the corner.
	 * `bare` leaves out the backdrop and the no-shrink, as the build panel has it.
	 */
	let {
		version,
		item,
		count = 1,
		size = 28,
		bare = false
	}: {
		version: string;
		item: { id: number; name: string };
		count?: number;
		size?: number;
		bare?: boolean;
	} = $props();

	const name = $derived(`${count > 1 ? `${count} × ` : ''}${item.name}`);
</script>

<span class={bare ? 'relative block' : 'relative block shrink-0'}>
	<img
		src={itemIconUrl(version, item.id)}
		alt={name}
		title={name}
		width={size}
		height={size}
		loading="lazy"
		decoding="async"
		class={bare ? 'rounded-sm' : 'rounded-sm bg-bg'}
	/>
	{#if count > 1}
		<span
			aria-hidden="true"
			class="absolute -right-1 -bottom-1 min-w-4 rounded-full border border-border bg-bg px-0.5 text-center text-[10px] leading-[14px] font-semibold"
			>{count}</span
		>
	{/if}
</span>
