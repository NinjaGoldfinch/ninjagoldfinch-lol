<script lang="ts">
	import { runeIconUrl, statShardIconUrl } from '#lib/assets.ts';
	import { SKILL_KEYS, formatSkillOrder, skillColumns, type Build } from '#lib/domain/builds.ts';
	import type { ScoreboardLine } from '#lib/domain/match-detail.ts';
	import { formatDuration } from '#lib/domain/matches.ts';
	import ChampionIcon from './ChampionIcon.svelte';
	import ItemIcon from './ItemIcon.svelte';

	/**
	 * One player's build: starter, boots, skill order and finished items, the
	 * skill grid, the shop visits and the rune page. Summoner spells and the
	 * keystone are on the scoreboard line, so the header leaves them out.
	 */
	let {
		build,
		line,
		version,
		closeHref,
		onclose
	}: {
		build: Build;
		line: ScoreboardLine;
		version: string;
		/** The page without this build; `onclose` may close it in place instead. */
		closeHref: string;
		onclose?: (event: MouseEvent) => void;
	} = $props();

	const who = $derived(
		line.riotId ? `${line.riotId.gameName}#${line.riotId.tagLine}` : line.champion.name
	);
	const columns = $derived(skillColumns(build.timeline?.skills.length ?? 0));
	const paths = $derived([
		{ label: 'Primary', ...build.runes.primary },
		{ label: 'Secondary', ...build.runes.secondary }
	]);

	const label = 'text-xs font-medium tracking-wide text-muted uppercase';
</script>

<section aria-labelledby="build-heading" class="rounded border border-border bg-surface">
	<div class="flex flex-wrap items-center gap-3 border-b border-border px-4 py-3">
		{#if line.champion.key}
			<ChampionIcon patch={version} id={line.champion.key} name={line.champion.name} size={40} />
		{/if}
		<h2 id="build-heading" class="font-semibold">
			Build <span class="text-muted">· {line.champion.name} · {who}</span>
		</h2>
		<a
			href={closeHref}
			onclick={onclose}
			aria-label="Close build"
			class="ml-auto rounded px-2 text-2xl leading-none text-muted hover:bg-bg hover:text-text">×</a
		>
	</div>

	<div class="grid gap-6 px-4 py-4 lg:grid-cols-[minmax(0,1fr)_16rem]">
		<div class="flex min-w-0 flex-col gap-6">
			{#if build.timeline === null}
				<p class="text-sm text-muted">Items and skills are unavailable right now.</p>
			{:else if build.timeline.visits.length === 0 && build.timeline.skills.length === 0}
				<p class="text-sm text-muted">No build for this player.</p>
			{:else}
				{@const { core, skillOrder, skills, visits } = build.timeline}
				{#if core === null}
					<p class="text-sm text-muted">
						Item data is unavailable, so the starter, boots and finished items can't be told apart.
					</p>
				{:else}
					<dl
						role="group"
						class="flex flex-wrap items-start gap-x-6 gap-y-3"
						aria-label="Build summary"
					>
						<div>
							<dt class={label}>Starter</dt>
							<dd class="mt-1">
								{#if core.starter.length > 0}
									<ul class="flex gap-0.5">
										{#each core.starter as item (item.id)}
											<li><ItemIcon {version} {item} count={item.count} bare /></li>
										{/each}
									</ul>
								{:else}<span class="text-muted">–</span>{/if}
							</dd>
						</div>
						<div>
							<dt class={label}>Boots</dt>
							<dd class="mt-1">
								{#if core.boots}<ItemIcon
										{version}
										item={core.boots}
										count={core.boots.count}
										bare
									/>{:else}<span class="text-muted">–</span>{/if}
							</dd>
						</div>
						<div>
							<dt class={label}>Skills</dt>
							<dd class="mt-1 text-sm font-semibold">
								{skillOrder ? formatSkillOrder(skillOrder) : '–'}
							</dd>
						</div>
						<div>
							<dt class={label}>Items</dt>
							<dd class="mt-1">
								{#if core.items.length > 0}
									<ol class="flex flex-wrap gap-x-1.5 gap-y-2" aria-label="Finished items">
										{#each core.items as item, i (i)}
											<li class="text-center">
												<ItemIcon {version} {item} bare />
												<p class="text-[11px] text-muted">{formatDuration(item.at)}</p>
											</li>
										{/each}
									</ol>
								{:else}<span class="text-muted">–</span>{/if}
							</dd>
						</div>
					</dl>
				{/if}

				<div>
					<h3 class={label}>
						Skill order{#if skillOrder}<span class="normal-case"
								>{` · ${formatSkillOrder(skillOrder)}`}</span
							>{/if}
					</h3>
					<!-- Narrow screens scroll the grid inside its box, not the page. -->
					<div class="mt-2 overflow-x-auto">
						<table class="border-separate border-spacing-0.5 text-center text-xs">
							<caption class="sr-only">Skill points in the order taken</caption>
							<thead>
								<tr>
									<td></td>
									{#each columns as n (n)}
										<th scope="col" class="w-6 font-normal text-muted">{n}</th>
									{/each}
								</tr>
							</thead>
							<tbody>
								{#each SKILL_KEYS as key, slot (key)}
									<tr>
										<th scope="row" class="w-6 pr-1 text-left font-semibold">{key}</th>
										{#each columns as n (n)}
											{@const up = skills[n - 1]}
											{#if up?.slot === slot + 1}
												<td
													class="size-6 rounded-sm bg-accent font-semibold text-bg"
													title="{key} at {formatDuration(up.at)}">{key}</td
												>
											{:else}
												<td class="size-6 rounded-sm bg-bg"></td>
											{/if}
										{/each}
									</tr>
								{/each}
							</tbody>
						</table>
					</div>
				</div>

				<div>
					<h3 class={label}>Shop visits</h3>
					{#if visits.length === 0}
						<p class="mt-2 text-sm text-muted">No items bought.</p>
					{:else}
						<!-- Purchases less than 30 seconds apart are one visit (ADR-032). -->
						<ol class="mt-2 flex flex-wrap items-start gap-x-2 gap-y-3" aria-label="Shop visits">
							{#each visits as visit, i (i)}
								<li class="flex items-start gap-2">
									{#if i > 0}<span class="mt-1.5 text-muted" aria-hidden="true">›</span>{/if}
									<div>
										<ul class="flex gap-0.5">
											{#each visit.items as item (item.id)}
												<li><ItemIcon {version} {item} count={item.count} bare /></li>
											{/each}
										</ul>
										<p class="mt-0.5 text-[11px] text-muted">{formatDuration(visit.at)}</p>
									</div>
								</li>
							{/each}
						</ol>
					{/if}
				</div>
			{/if}
		</div>

		<div>
			<h3 class={label}>Runes</h3>
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
										decoding="async"
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
									decoding="async"
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
