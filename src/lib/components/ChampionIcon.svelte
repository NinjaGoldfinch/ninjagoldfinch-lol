<script lang="ts">
	import { championIconUrl } from '#lib/assets.ts';

	let {
		patch,
		id,
		name,
		size = 32
	}: { patch: string; id: string; name: string; size?: number } = $props();
</script>

<img
	src={championIconUrl(patch, id)}
	alt={name}
	title={name}
	width={size}
	height={size}
	loading="lazy"
	decoding="async"
	class="rounded bg-surface"
/>
