import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './styles/app.css'
import App from './App.tsx'
import { AppErrorBoundary } from './components/AppErrorBoundary'
import { applyContentOverrides } from './game/content'
import { readCachedContent } from './store/contentCache'

// Apply the cached content overlay **before render**: `ContentSync` refreshes it afterwards, but
// waiting for that fetch would show old names and prices first and then "jump" to the admin build.
applyContentOverrides(readCachedContent())

createRoot(document.getElementById('root')!).render(
	<StrictMode>
		<AppErrorBoundary>
			<App />
		</AppErrorBoundary>
	</StrictMode>,
)
