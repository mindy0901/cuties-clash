import fs from 'node:fs'
import path from 'node:path'
import { tanstackRouter } from '@tanstack/router-plugin/vite'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig, type Plugin } from 'vite'

/** Backend Fastify khi chạy dev (xem backend/README.md hoặc docker-compose.yml). */
const API_TARGET = process.env.VITE_API_TARGET ?? 'http://localhost:8000'

/**
 * Trả `index.html` cho mọi đường dẫn không phải tệp có thật và không phải `/api/*`.
 *
 * Dev server của Vite cũng cần việc này: mở thẳng http://localhost:5190/cua-hang
 * sẽ 404 nếu không có, còn trong Docker thì nginx lo (frontend/nginx.conf).
 * Middleware này chạy SAU proxy `/api` nên không nuốt mất lời gọi API.
 */
function spaFallback(): Plugin {
	return {
		name: 'martial-cutie:spa-fallback',
		configureServer(server) {
			server.middlewares.use((req, _res, next) => {
				const url = (req.url ?? '/').split('?')[0]
				if (!req.headers.accept?.includes('text/html')) return next()
				if (url.startsWith('/api/')) return next()
				if (path.extname(url)) return next()
				const indexFile = path.resolve(server.config.root, 'index.html')
				if (!fs.existsSync(indexFile)) return next()
				// Ghi đè URL để Vite chạy đúng transform HTML cho index.html.
				req.url = '/index.html'
				next()
			})
		},
	}
}

// https://vite.dev/config/
export default defineConfig({
	plugins: [
		// Sinh `src/routeTree.gen.ts` từ thư mục `src/routes`. Phải đứng TRƯỚC react().
		tanstackRouter({
			target: 'react',
			routesDirectory: './src/routes',
			generatedRouteTree: './src/routeTree.gen.ts',
			autoCodeSplitting: false,
		}),
		react(),
		tailwindcss(),
		spaFallback(),
	],
	server: {
		port: 5190,
		proxy: {
			// Chuyển tiếp mọi lời gọi API sang Fastify. Nhờ vậy trình duyệt luôn nói
			// chuyện cùng origin, cookie phiên hoạt động giống hệt khi chạy production.
			'/api': {
				target: API_TARGET,
				changeOrigin: false,
			},
		},
	},
})
