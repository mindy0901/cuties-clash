import { createFileRoute } from '@tanstack/react-router'
import { PrepScreen } from '../components/PrepScreen'

/** Phòng chuẩn bị — màn hình chính (đường dẫn `/`). */
export const Route = createFileRoute('/')({ component: PrepScreen })
