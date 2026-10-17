import { createFileRoute } from '@tanstack/react-router'
import { AdminContentScreen } from '../components/AdminContentScreen'

/** Content admin page (`/quan-tri`) — accounts listed in `ADMIN_EMAILS` only. */
export const Route = createFileRoute('/quan-tri')({ component: AdminContentScreen })
