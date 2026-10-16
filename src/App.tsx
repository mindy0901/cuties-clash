import { useState } from 'react'
import { BattleScreen } from './components/BattleScreen'
import { PrepScreen } from './components/PrepScreen'
import { ResultDialog } from './components/ResultDialog'
import { StageMapDialog } from './components/StageMapDialog'
import { Toasts } from './components/Toasts'
import { TopBar } from './components/TopBar'
import { VictoryScreen } from './components/VictoryScreen'
import { useGameStore } from './store/gameStore'

export default function App() {
	const phase = useGameStore((state) => state.phase)
	const [mapOpen, setMapOpen] = useState(false)

	return (
		<div className="app">
			<TopBar onOpenMap={() => setMapOpen(true)} />
			{phase === 'battle' || phase === 'result' ? <BattleScreen /> : <PrepScreen />}
			{phase === 'result' ? <ResultDialog /> : null}
			{phase === 'victory' ? <VictoryScreen /> : null}
			{mapOpen ? <StageMapDialog onClose={() => setMapOpen(false)} /> : null}
			<Toasts />
		</div>
	)
}
