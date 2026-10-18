<script lang="ts">
	import { runeIconUrl, summonerSpellIconUrl } from '#lib/assets.ts';
	import {
		formatSkillOrder,
		roleLabel,
		type PopularChoices,
		type RuneChoice,
		type SetBuilds,
		type SpellPair,
		type VsChoice,
		type VsPick
	} from '#lib/domain/champion-page.ts';
	import { formatRate, isLowSample } from '#lib/domain/champion-stats.ts';
	import ItemIcon from './ItemIcon.svelte';
	import LowSample from './LowSample.svelte';

	/**
	 * A champion's set builds as tabs, each its two core items with win rate and
	 * games: the top runes, spells, skill order, starter and boots, then the item
	 * path with each later step's options. With no set builds, or when they
	 * failed, the champion detail's most played items, runes and spells.
	 *
	 * A *vs* picker leads the tabs. Against an opponent riot-proxy sends no
	 * skill order, starter or 4th and 5th items, so those are left out, and
	 * there is no fallback: the detail's lists aren't against anyone. ADR-043.
	 */
	let {
		setBuilds,
		popular,
		version,
		open,
		tabHref,
		vs,
		choices,
		pickerAction,
		fields
	}: {
		setBuilds: SetBuilds | null;
		popular: PopularChoices;
		version: string;
		/** The open tab, 0-based. */
		open: number;
		tabHref: (index: number) => string;
		/** The lane opponent picked; null for every game. */
		vs: VsPick | null;
		/** The opponents the picker offers. */
		choices: VsChoice[];
		/** Where the picker's GET form goes. */
		pickerAction: string;
		/** The view's other fields, kept by the picker. */
		fields: [string, string][];
	} = $props();

	const build = $derived(setBuilds?.builds[open] ?? setBuilds?.builds[0]);
	const label = 'text-xs font-medium tracking-wide text-muted uppercase';
	const games = (n: number) => `${n.toLocaleString('en')} ${n === 1 ? 'game' : 'games'}`;

	const submit = (event: Event & { currentTarget: HTMLSelectElement }) =>
		event.currentTarget.form?.requestSubmit();
</script>

{#snippet rated(winRate: number, n: number)}
	<span class="text-xs whitespace-nowrap tabular-nums"
		><span class={isLowSample(n) ? 'text-muted' : ''}>{formatRate(winRate)}</span>
		<span class="text-muted">· {n.toLocaleString('en')}</span>{#if isLowSample(n)}<LowSample
			/>{/if}</span
	>
{/snippet}

{#snippet runes(choice: RuneChoice)}
	<span class="flex items-center gap-1">
		{#each [choice.keystone, choice.subStyle] as rune, i (i)}
			{#if rune}
				<img
					src={runeIconUrl(rune.icon)}
					alt={rune.name}
					title={rune.name}
					width={i === 0 ? 28 : 20}
					height={i === 0 ? 28 : 20}
					loading="lazy"
					class="rounded-full bg-bg"
				/>
			{:else}<span class="text-muted">–</span>{/if}
		{/each}
	</span>
{/snippet}

{#snippet spells(pair: SpellPair)}
	<span class="flex items-center gap-0.5">
		{#each pair as spell, i (i)}
			{#if spell}
				<img
					src={summonerSpellIconUrl(version, spell.id)}
					alt={spell.name}
					title={spell.name}
					width="24"
					height="24"
					loading="lazy"
					class="rounded-sm bg-bg"
				/>
			{:else}<span class="text-muted">–</span>{/if}
		{/each}
	</span>
{/snippet}

<section
	id="builds"
	aria-labelledby="builds-heading"
	class="rounded border border-border bg-surface"
>
	<div class="flex flex-wrap items-baseline gap-x-3 gap-y-1 border-b border-border px-4 py-3">
		<h2 id="builds-heading" class="font-semibold">Builds</h2>
		{#if setBuilds && build}
			<p class="text-sm text-muted">
				{setBuilds.role ? `${roleLabel(setBuilds.role)} · ` : ''}{games(setBuilds.totalGames)} with a
				build{vs ? ` against ${vs.name}` : ''}
			</p>
		{/if}
	</div>

	{#if choices.length > 0 || vs}
		<!-- GET, so each pick has its own URL; the role, tier and patch are kept. -->
		<form
			method="GET"
			action={pickerAction}
			aria-label="Builds against an opponent"
			class="flex flex-wrap items-center gap-2 border-b border-border px-4 py-3"
		>
			{#each fields as [name, value] (name)}<input type="hidden" {name} {value} />{/each}
			<label>
				<span class="sr-only">Against</span>
				<select
					name="vs"
					onchange={submit}
					class="h-9 max-w-full rounded border border-border bg-bg px-2 text-sm focus:border-accent focus:outline-none"
				>
					<option value="" selected={!vs}>vs any opponent</option>
					{#each choices as choice (choice.opponentId)}
						<option value={choice.slug} selected={vs?.opponentId === choice.opponentId}
							>vs {choice.name}{choice.games === null
								? ''
								: ` · ${choice.games.toLocaleString('en')}`}</option
						>
					{/each}
				</select>
			</label>
			<noscript>
				<button type="submit" class="h-9 rounded border border-border bg-surface px-3 text-sm">
					Apply
				</button>
			</noscript>
		</form>
	{/if}

	{#if setBuilds && build}
		<nav aria-label="Builds" class="flex flex-wrap gap-2 border-b border-border px-4 py-3">
			{#each setBuilds.builds as option, i (i)}
				{@const current = option === build}
				<a
					href={tabHref(i)}
					aria-current={current ? 'page' : undefined}
					data-sveltekit-reset="false"
					data-sveltekit-replacestate
					class="flex items-center gap-2 rounded border px-2 py-1.5 text-sm {current
						? 'border-accent bg-bg'
						: 'border-border hover:border-accent'}"
				>
					<span class="flex gap-0.5">
						{#each option.core as item (item.id)}<ItemIcon {version} {item} size={24} />{/each}
					</span>
					<span class="tabular-nums">
						<span class="font-semibold {isLowSample(option.games) ? 'text-muted' : ''}"
							>{formatRate(option.winRate)}</span
						>
						<span class="text-xs text-muted">{games(option.games)}</span
						>{#if isLowSample(option.games)}<LowSample />{/if}
					</span>
				</a>
			{/each}
		</nav>

		<div class="flex flex-col gap-5 px-4 py-4">
			<dl
				role="group"
				aria-label="Build summary"
				class="flex flex-wrap items-start gap-x-6 gap-y-3"
			>
				<div>
					<dt class={label}>Runes</dt>
					<dd class="mt-1">
						{#if build.runes}{@render runes(build.runes)}{:else}<span class="text-muted">–</span
							>{/if}
					</dd>
				</div>
				<div>
					<dt class={label}>Spells</dt>
					<dd class="mt-1">
						{#if build.spells}{@render spells(build.spells)}{:else}<span class="text-muted">–</span
							>{/if}
					</dd>
				</div>
				{#if !vs || build.skillOrder}
					<div>
						<dt class={label}>Skills</dt>
						<dd class="mt-1 text-sm font-semibold">
							{build.skillOrder ? formatSkillOrder(build.skillOrder) : '–'}
						</dd>
					</div>
				{/if}
				{#if !vs || build.starter}
					<div>
						<dt class={label}>Starter</dt>
						<dd class="mt-1">
							{#if build.starter}
								<span class="flex gap-0.5">
									{#each build.starter as item (item.id)}
										<ItemIcon {version} {item} count={item.count} />
									{/each}
								</span>
							{:else}<span class="text-muted">–</span>{/if}
						</dd>
					</div>
				{/if}
				<div>
					<dt class={label}>Boots</dt>
					<dd class="mt-1">
						{#if build.boots}<ItemIcon {version} item={build.boots} />{:else}<span
								class="text-muted">–</span
							>{/if}
					</dd>
				</div>
			</dl>

			<div>
				<h3 class={label}>Item path</h3>
				<ol class="mt-2 flex flex-wrap items-start gap-x-2 gap-y-3" aria-label="Item path">
					{#each build.core as item, i (item.id)}
						<li class="flex items-start gap-2">
							{#if i > 0}<span class="mt-1.5 text-muted" aria-hidden="true">›</span>{/if}
							<ItemIcon {version} {item} size={32} />
						</li>
					{/each}
					{#each build.next as options, step (step)}
						<li class="flex items-start gap-2">
							<span class="mt-1.5 text-muted" aria-hidden="true">›</span>
							{#if options.length === 0}
								<span class="mt-1.5 text-muted">–</span>
							{:else}
								<!-- The options for the 3rd, 4th and 5th item, most played first. -->
								<ul class="flex flex-col gap-1" aria-label="Item {step + 3} options">
									{#each options as option (option.id)}
										<li class="flex items-center gap-1.5">
											<ItemIcon {version} item={option} />
											{@render rated(option.winRate, option.games)}
										</li>
									{/each}
								</ul>
							{/if}
						</li>
					{/each}
				</ol>
			</div>
		</div>
	{:else if vs}
		<p class="px-4 py-4 text-sm text-muted">
			{setBuilds
				? `No builds against ${vs.name} in this slice yet.`
				: `Builds against ${vs.name} are unavailable right now.`}
		</p>
	{:else}
		<div class="flex flex-col gap-5 px-4 py-4">
			<p class="text-sm text-muted">
				{setBuilds
					? 'No full builds recorded yet. These are the most played choices.'
					: 'Full builds are unavailable right now. These are the most played choices.'}
			</p>
			<div>
				<h3 class={label}>Items</h3>
				{#if popular.items.length === 0}
					<p class="mt-2 text-sm text-muted">–</p>
				{:else}
					<ul class="mt-2 flex flex-wrap gap-3" aria-label="Most played items">
						{#each popular.items as item (item.id)}
							<li class="flex items-center gap-1.5">
								<ItemIcon {version} {item} />
								{@render rated(item.winRate, item.games)}
							</li>
						{/each}
					</ul>
				{/if}
			</div>
			<div class="flex flex-wrap gap-x-10 gap-y-5">
				<div>
					<h3 class={label}>Runes</h3>
					<ul class="mt-2 flex flex-col gap-1.5" aria-label="Most played runes">
						{#each popular.runes as choice, i (i)}
							<li class="flex items-center gap-2 text-xs tabular-nums">
								{@render runes(choice)}
								{@render rated(choice.winRate, choice.games)}
							</li>
						{:else}<li class="text-sm text-muted">–</li>{/each}
					</ul>
				</div>
				<div>
					<h3 class={label}>Spells</h3>
					<ul class="mt-2 flex flex-col gap-1.5" aria-label="Most played spells">
						{#each popular.spells as choice, i (i)}
							<li class="flex items-center gap-2 text-xs tabular-nums">
								{@render spells(choice.spells)}
								{@render rated(choice.winRate, choice.games)}
							</li>
						{:else}<li class="text-sm text-muted">–</li>{/each}
					</ul>
				</div>
			</div>
		</div>
	{/if}
</section>
