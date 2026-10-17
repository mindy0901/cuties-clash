import { createFileRoute } from '@tanstack/react-router'
import { ShopScreen } from '../components/ShopScreen'

/** Item shop (URL `/shop`). */
export const Route = createFileRoute('/shop')({ component: ShopScreen })
