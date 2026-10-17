import { createFileRoute } from '@tanstack/react-router'
import { ShopScreen } from '../components/ShopScreen'

/** Item shop (URL `/cua-hang`). */
export const Route = createFileRoute('/cua-hang')({ component: ShopScreen })
