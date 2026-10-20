import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export const BATTLE_SPEEDS = [0.5, 1, 2, 3] as const

export type BattleSpeed = (typeof BATTLE_SPEEDS)[number]

interface BattleSettingsState {
	speed: BattleSpeed
	setSpeed: (speed: BattleSpeed) => void
	/** Training room: does the immortal dummy swing its one weapon, or stand still? */
	trainingAttacks: boolean
	setTrainingAttacks: (value: boolean) => void
}

function isBattleSpeed(value: unknown): value is BattleSpeed {
	return BATTLE_SPEEDS.some((speed) => speed === value)
}

export const useBattleSettingsStore = create<BattleSettingsState>()(
	persist(
		(set) => ({
			speed: 2,
			setSpeed: (speed) => set({ speed }),
			trainingAttacks: true,
			setTrainingAttacks: (value) => set({ trainingAttacks: value }),
		}),
		{
			name: 'martial-cutie-battle-settings',
			partialize: (state) => ({ speed: state.speed, trainingAttacks: state.trainingAttacks }),
			merge: (persistedState, currentState) => {
				const persisted = persistedState as Partial<BattleSettingsState> | undefined
				return {
					...currentState,
					speed: isBattleSpeed(persisted?.speed) ? persisted.speed : currentState.speed,
					trainingAttacks:
						typeof persisted?.trainingAttacks === 'boolean'
							? persisted.trainingAttacks
							: currentState.trainingAttacks,
				}
			},
		},
	),
)
