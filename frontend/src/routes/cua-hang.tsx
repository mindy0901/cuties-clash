import { createFileRoute } from '@tanstack/react-router'
import { ShopScreen } from '../components/ShopScreen'

/** Cửa hàng vật phẩm (đường dẫn `/cua-hang`). */
export const Route = createFileRoute('/cua-hang')({ component: ShopScreen })
