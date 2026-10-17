import { createFileRoute } from '@tanstack/react-router'
import { PrepScreen } from '../components/PrepScreen'

/** Preparation room — the main screen (URL `/`). */
export const Route = createFileRoute('/')({ component: PrepScreen })
