import type { ReactNode } from 'react'
import { MAX_CUTIE_LEVEL, getCutie, cutieLevelStats, cutieUpgradeCost, cutieList } from '../game/cuties'
import { STAT_LABELS, isPercentStat, statNumber } from '../game/stats'
import { estimatePower } from '../game/build'
import { playerCombatantFor, useGameStore } from '../store/gameStore'
import type { StatKey } from '../game/types'
import { CutieIcon } from './ItemIcon'
import { ArrowLeftRight, Check, Gold, Star } from './icons'
import { CutieTile } from './CutieTile'
import { cn, panelClass, panelHeadClass, panelTitleClass, statClass, tagClass, tagGoldClass } from './ui'
import { Button } from './ui/button'
import { translate } from '../i18n'
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuTrigger,
} from './shadcn/dropdown-menu'

const EXTRA_STATS: StatKey[] = ['lifesteal', 'dr']

function Stat({
	label,
	value,
	detail,
	className,
}: {
	label: string
	value: string
	/** The `base + gear` split, shown in brackets — `undefined` when Trang bị adds nothing. */
	detail?: { base: string; gear: string }
	className?: string
}) {
	return (
		<div className={cn(statClass, className)}>
			<span className="text-gold-soft">{label}</span>
			<span className="flex items-center gap-1.5 font-semibold tabular-nums">
				{/* The total reads in gold; the `base + gear` breakdown behind it stays quiet. */}
				<span className="text-gold-soft">{value}</span>
				{detail ? (
					/* Two sources, two colours: the Cutie's own number is white, the gear part is jade. */
					<span data-stat-detail className="text-[11.5px] font-normal text-white">
						({detail.base} + <span className="text-jade">{detail.gear}</span>)
					</span>
				) : null}
			</span>
		</div>
	)
}

/** The gold pill both the level and Power are drawn in — one style, one font size. */
function Pill({ children }: { children: ReactNode }) {
	return (
		<span
			className={cn(
				tagClass,
				tagGoldClass,
				'inline-flex items-center gap-1 rounded-full bg-linear-to-b from-gold/25 to-gold/5 px-2 font-semibold tabular-nums shadow-[inset_0_1px_0_rgb(255_255_255/12%)]',
			)}
		>
			{children}
		</span>
	)
}

/**
 * The panel prints **bare numbers**: it is a read-out of what the Cutie has, not a list of bonuses, so
 * no value carries a leading "+". A flat 0 is a real value here — "no lifesteal" has to read 0.
 */
function statValue(key: StatKey, value: number): string {
	return isPercentStat(key) ? `${statNumber(value)}%` : statNumber(value)
}

/**
 * The `base + gear` breakdown shown in brackets after the total (`21 (20 + 1)`).
 *
 * The two numbers keep their **own colour** in the UI: `base` is white and `gear` is jade, because they
 * come from two different places (the Cutie's sheet and the items in Trang bị).
 *
 * `undefined` when Trang bị adds nothing, so an unequipped row stays one clean number instead of
 * reading `(2000 + 0)`. The gear part is tested **before** rounding — `0.2` is a real bonus.
 */
function breakdown(key: StatKey, base: number, gear: number): { base: string; gear: string } | undefined {
	if (Number(gear.toFixed(2)) === 0) return undefined
	return { base: statValue(key, base), gear: statValue(key, gear) }
}

/**
 * Combined cutie profile: inspect combat stats, switch cuties, and upgrade.
 *
 * ⚠️ `className` is for the **page layout only** (the preparation room passes `flex-1` so this panel
 * is exactly as tall as the storage beside it); ❌ do not use it to restyle the panel.
 */
export function CutiePanel({ className }: { className?: string }) {
	const run = useGameStore((state) => state.run)
	const selectCutie = useGameStore((state) => state.selectCutie)
	const upgradeCutie = useGameStore((state) => state.upgradeCutie)
	const cutie = getCutie(run.cutieId)
	const level = run.cuties[run.cutieId] ?? 1
	const levelStats = cutieLevelStats(cutie, level)
	const combatant = playerCombatantFor(run)
	// The cutie's own swings (its attack kits) — each is its own cadence, like an item's.
	const ownSwings = combatant.weapons.filter((weapon) => weapon.templateId === 'skill')
	const upgradeCost = cutieUpgradeCost(level)
	return (
		<section className={cn(panelClass, className)}>
			<div className={panelHeadClass}>
				<div aria-hidden />
				<h2 className={panelTitleClass}>{translate('Cuties')}</h2>
				<div aria-hidden />
			</div>

			<div className="flex items-center gap-3">
				<DropdownMenu>
					<DropdownMenuTrigger asChild>
						<button
							type="button"
							aria-label={translate('Đổi Cutie: {name}', { name: translate(cutie.name) })}
							className="group relative shrink-0 rounded-full outline-none focus-visible:ring-2 focus-visible:ring-gold"
						>
							<CutieTile cutieId={cutie.id} round className="size-24 border-2 border-gold/40" iconClass="text-5xl" />
							{/* The swap badge rides on the avatar, so the name can sit straight after it. */}
							<span
								aria-hidden
								data-change-cutie
								className="absolute -right-1 -bottom-1 grid size-7 place-items-center rounded-full border border-gold/50 bg-ink-800 text-gold-soft transition-colors group-hover:border-gold group-hover:text-gold"
							>
								<ArrowLeftRight className="size-3.5" />
							</span>
						</button>
					</DropdownMenuTrigger>
					<DropdownMenuContent align="start" className="max-h-80 overflow-y-auto">
						<DropdownMenuLabel>{translate('Chọn Cutie')}</DropdownMenuLabel>
						{/* cutieList(), ❌ not the raw CUTIES: the admin page owns a Cutie's name, blurb and
						    unlock stage, and a list built from the code array showed the old ones next to a
						    portrait drawn from the merged definition. */}
						{cutieList().map((entry) => {
							const unlocked = run.unlockedCuties.includes(entry.id)
							return (
								<DropdownMenuItem
									key={entry.id}
									aria-label={translate(entry.name)}
									disabled={!unlocked}
									onSelect={() => selectCutie(entry.id)}
									title={
										unlocked
											? translate(entry.blurb)
											: translate('Mở khoá khi qua màn {stage}', { stage: entry.unlockStage })
									}
								>
									<span className="flex items-center gap-2">
										<span className="grid size-7 shrink-0 place-items-center">
											<CutieIcon cutieId={entry.id} emojiClass="text-xl" />
										</span>
										<span>{translate(entry.name)}</span>
										{entry.id === cutie.id ? <Check className="ml-auto size-4 shrink-0 text-gold-soft" /> : null}
									</span>
									{!unlocked ? (
										<span className="pl-9 text-[11px] text-muted">
											{translate('Mở khoá khi qua màn {stage}', { stage: entry.unlockStage })}
										</span>
									) : null}
								</DropdownMenuItem>
							)
						})}
					</DropdownMenuContent>
				</DropdownMenu>
				<div className="min-w-0">
					<div className="truncate text-lg font-bold text-gold-soft">{translate(cutie.name)}</div>
					<div className="text-xs text-muted">{translate(cutie.blurb)}</div>
				</div>
			</div>

			{/* One row, two corners: Power on the left, the level on the right — the same gold pill. */}
			<div className="flex items-center justify-between gap-2">
				<Pill>
					<span>{translate('Sức mạnh')}</span>
					<span>{estimatePower(combatant).toLocaleString('en-US')}</span>
				</Pill>
				<Pill>
					<Star className="size-3 text-gold" fill="currentColor" />
					{translate('Cấp {level}', { level: `${level}/${MAX_CUTIE_LEVEL}` })}
				</Pill>
			</div>

			{/* One full-width row per stat, like Sword Energy: the **total**, with `base + gear` in brackets. */}
			<div className="flex flex-col gap-2">
				<Stat
					label={translate('Máu')}
					value={statValue('maxHp', combatant.stats.maxHp)}
					detail={breakdown('maxHp', levelStats.maxHp, combatant.stats.maxHp - levelStats.maxHp)}
				/>
				<Stat
					label={translate('Giáp')}
					value={statValue('shield', combatant.stats.shield)}
					detail={breakdown('shield', 0, combatant.stats.shield)}
				/>
				{/* Attack = the Cutie's own number + what Trang bị adds — the number every swing multiplies. */}
				<Stat
					label={translate('Tấn công')}
					value={statValue('atk', levelStats.attack + combatant.stats.atk)}
					detail={breakdown('atk', levelStats.attack, combatant.stats.atk)}
				/>
				{/* ❌ No "Tốc độ" row any more: there is no cutie-wide rate. Each weapon carries its own
				    Cooldown Time, and the box below ("Đòn đánh thường") already prints the resulting
				    cadence — a second row would either repeat it or contradict it. */}
				<Stat
					label={translate('Chí mạng')}
					value={statValue('critRate', combatant.stats.critRate)}
					detail={breakdown('critRate', cutie.critRate, combatant.stats.critRate - cutie.critRate)}
				/>
				<Stat
					label={translate('Sát thương chí mạng')}
					value={statValue('critDamage', combatant.stats.critDamage)}
					detail={breakdown('critDamage', cutie.critDamage, combatant.stats.critDamage - cutie.critDamage)}
				/>
				{EXTRA_STATS.map((key) => (
					<Stat
						key={key}
						label={translate(STAT_LABELS[key])}
						value={statValue(key, combatant.stats[key])}
						detail={breakdown(key, 0, combatant.stats[key])}
					/>
				))}
				<Stat
					label={translate('Kiếm Thế')}
					value={`${combatant.maxSe} (${Math.round(combatant.seRegen)}/s)`}
				/>
			</div>

			<div className="rounded-[10px] border border-gold/35 bg-gold/8 p-2.5">
				<div className="text-[11px] font-semibold tracking-wide text-gold-soft uppercase">
					{translate('Đòn đánh thường')}
				</div>
				<div className="mt-1 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
					{ownSwings.length === 0 ? (
						<span className="text-[13px] text-muted">
							{translate('Chưa có kit đòn đánh — Cutie không tự tấn công.')}
						</span>
					) : (
						ownSwings.map((swing) => (
							<span key={swing.uid} className="text-sm font-semibold text-gold-soft">
								{translate('Sát thương {damage} · mỗi {seconds}s', {
									damage: swing.damage,
									seconds: (swing.interval / 1000).toFixed(1),
								})}
							</span>
						))
					)}
				</div>
			</div>

			{/* At the cap the action is gone for good, so the button goes with it — a permanently dimmed
			    "Maximum level reached" bar is just noise at the bottom of the panel. */}
			{level < MAX_CUTIE_LEVEL ? (
				<Button
					type="button"
					// Dimmed when the purse is short: the toast that used to explain a refused click is gone,
					// so the button itself has to show that it cannot be used (same rule as Reroll in the shop).
					variant="destructive" className={cn('w-full')}
					disabled={run.gold < upgradeCost}
					onClick={upgradeCutie}
				>
					{translate('Nâng cấp · {cost}', { cost: upgradeCost })} <Gold />
				</Button>
			) : null}
		</section>
	)
}
