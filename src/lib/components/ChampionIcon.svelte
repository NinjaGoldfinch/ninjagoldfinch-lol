<script lang="ts">
	import { championIconUrl } from '#lib/assets.ts';

	/** `priority` for the page's main image: loaded at once and fetched first (SPD-10). */
	let {
		patch,
		id,
		name,
		size = 32,
		priority = false
	}: { patch: string; id: string; name: string; size?: number; priority?: boolean } = $props();
</script>

<img
	src={championIconUrl(patch, id)}
	alt={name}
	title={name}
	width={size}
	height={size}
	loading={priority ? 'eager' : 'lazy'}
	fetchpriority={priority ? 'high' : 'auto'}
	decoding="async"
	class="rounded bg-surface"
/>
