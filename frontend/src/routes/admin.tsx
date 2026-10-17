import { createFileRoute } from '@tanstack/react-router'
import { AdminContentScreen } from '../components/AdminContentScreen'

/** Content admin page (`/admin`) — accounts listed in `ADMIN_EMAILS` only. */
export const Route = createFileRoute('/admin')({ component: AdminContentScreen })
