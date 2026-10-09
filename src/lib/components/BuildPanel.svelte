<script lang="ts">
	import { itemIconUrl, runeIconUrl, statShardIconUrl } from '#lib/assets.ts';
	import { SKILL_KEYS, maxOrder, type Build } from '#lib/domain/builds.ts';
	import type { ScoreboardLine } from '#lib/domain/match-detail.ts';
	import ChampionIcon from './ChampionIcon.svelte';
	import Loadout from './Loadout.svelte';

	/** One player's build: item order, skill order and rune page. */
	let { build, line, version }: { build: Build; line: ScoreboardLine; version: string } = $props();

	const who = $derived(
		line.riotId ? `${line.riotId.gameName}#${line.riotId.tagLine}` : line.champion.name
	);
	const priority = $derived(build.skills && maxOrder(build.skills));
	const paths = $derived([
		{ label: 'Primary', ...build.runes.primary },
		{ label: 'Secondary', ...build.runes.secondary }
	]);
</script>

<section
	id="build"
	aria-labelledby="build-heading"
	class="scroll-mt-4 rounded border border-border bg-surface"
>
	<div class="flex flex-wrap items-center gap-3 border-b border-border px-4 py-3">
		{#if line.champion.key}
			<ChampionIcon patch={version} id={line.champion.key} name={line.champion.name} size={40} />
		{/if}
		<h2 id="build-heading" class="font-semibold">
			Build <span class="text-muted">· {line.champion.name} · {who}</span>
		</h2>
		<div class="flex gap-0.5">
			<Loadout spells={line.spells} runes={line.runes} {version} size={20} />
		</div>
	</div>

	<div class="grid gap-6 px-4 py-4 lg:grid-cols-[minmax(0,1fr)_16rem]">
		<div class="flex min-w-0 flex-col gap-6">
			<div>
				<h3 class="text-xs font-medium tracking-wide text-muted uppercase">Item order</h3>
				{#if build.items === null}
					<p class="mt-2 text-sm text-muted">Item order is unavailable right now.</p>
				{:else if build.items.length === 0}
					<p class="mt-2 text-sm text-muted">No items bought.</p>
				{:else}
					<ol class="mt-2 flex flex-wrap items-start gap-x-2 gap-y-3" aria-label="Item order">
						{#each build.items as step, i (i)}
							<li class="flex items-start gap-2">
								{#if i > 0}<span class="mt-1.5 text-muted" aria-hidden="true">›</span>{/if}
								<div>
									<ul class="flex gap-0.5">
										{#each step.items as item, j (j)}
											<li>
												<img
													src={itemIconUrl(version, item.id)}
													alt={item.sold ? `Sold ${item.name}` : item.name}
													title={item.sold ? `Sold ${item.name}` : item.name}
													width="28"
													height="28"
													loading="lazy"
													class="rounded-sm {item.sold ? 'opacity-40 grayscale' : ''}"
												/>
											</li>
										{/each}
									</ul>
									<p class="mt-0.5 text-[11px] text-muted">{step.minute} min</p>
								</div>
							</li>
						{/each}
					</ol>
				{/if}
			</div>

			<div>
				<h3 class="text-xs font-medium tracking-wide text-muted uppercase">
					Skill order{#if priority && priority.length > 0}<span class="normal-case"
							>{` · ${priority.map((s) => SKILL_KEYS[s - 1]).join(' > ')}`}</span
						>{/if}
				</h3>
				{#if build.skills === null}
					<p class="mt-2 text-sm text-muted">Skill order is unavailable right now.</p>
				{:else}
					<!-- Narrow screens scroll the grid inside its box, not the page. -->
					<div class="mt-2 overflow-x-auto">
						<table class="border-separate border-spacing-0.5 text-center text-xs">
							<caption class="sr-only">Skill points by champion level</caption>
							<thead>
								<tr>
									<td></td>
									{#each build.skills.map((_, i) => i + 1) as level (level)}
										<th scope="col" class="w-6 font-normal text-muted">{level}</th>
									{/each}
								</tr>
							</thead>
							<tbody>
								{#each SKILL_KEYS as key, slot (key)}
									<tr>
										<th scope="row" class="w-6 pr-1 text-left font-semibold">{key}</th>
										{#each build.skills as skill, level (level)}
											<td
												class="size-6 rounded-sm {skill === slot + 1
													? 'bg-accent font-semibold text-bg'
													: 'bg-bg'}"
												>{#if skill === slot + 1}{key}{/if}</td
											>
										{/each}
									</tr>
								{/each}
							</tbody>
						</table>
					</div>
				{/if}
			</div>
		</div>

		<div>
			<h3 class="text-xs font-medium tracking-wide text-muted uppercase">Runes</h3>
			{#each paths as path (path.label)}
				<div class="mt-2">
					<p class="text-sm font-medium">{path.path?.name ?? `${path.label} path`}</p>
					<ul class="mt-1 flex flex-col gap-1" aria-label="{path.label} runes">
						{#each path.runes as rune, i (i)}
							{#if rune}
								<li class="flex items-center gap-2 text-sm">
									<img
										src={runeIconUrl(rune.icon)}
										alt=""
										width={path.label === 'Primary' && i === 0 ? 28 : 22}
										height={path.label === 'Primary' && i === 0 ? 28 : 22}
										loading="lazy"
										class="rounded-full bg-bg"
									/>
									{rune.name}
								</li>
							{/if}
						{/each}
					</ul>
				</div>
			{/each}
			{#if build.runes.shards.some(Boolean)}
				<ul class="mt-3 flex gap-1" aria-label="Stat shards">
					{#each build.runes.shards as shard, i (i)}
						{#if shard}
							<li>
								<img
									src={statShardIconUrl(version, shard.icon)}
									alt={shard.name}
									title={shard.name}
									width="22"
									height="22"
									loading="lazy"
									class="rounded-full bg-bg p-0.5"
								/>
							</li>
						{/if}
					{/each}
				</ul>
			{/if}
		</div>
	</div>
</section>
