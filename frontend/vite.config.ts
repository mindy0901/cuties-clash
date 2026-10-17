import fs from 'node:fs'
import path from 'node:path'
import { tanstackRouter } from '@tanstack/router-plugin/vite'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig, type Plugin } from 'vite'

/** Fastify backend when running dev (see backend/README.md or docker-compose.yml). */
const API_TARGET = process.env.VITE_API_TARGET ?? 'http://localhost:8000'

/**
 * Return `index.html` for every path that is not a real file and not `/api/*`.
 *
 * Vite's dev server needs this too: opening http://localhost:5190/cua-hang directly
 * would 404 without it, while in Docker nginx takes care of it (frontend/nginx.conf).
 * This middleware runs AFTER the `/api` proxy, so it does not swallow API calls.
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
				// Override the URL so Vite runs the correct HTML transform for index.html.
				req.url = '/index.html'
				next()
			})
		},
	}
}

// https://vite.dev/config/
export default defineConfig({
	plugins: [
		// Generate `src/routeTree.gen.ts` from the `src/routes` directory. Must come BEFORE react().
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
		// Inside a container it must listen on 0.0.0.0 to be reachable outside Docker. Set it via
		// an environment variable instead of passing `--host` via pnpm: the form `pnpm --filter x dev -- --host`
		// does NOT forward arguments to Vite (tried it, Vite still listened on 127.0.0.1 only).
		host: process.env.VITE_DEV_HOST === 'true' ? true : undefined,
		// Windows/Docker bind mounts often do not emit filesystem events to the
		// container, which silently stops HMR. The `vite` service in compose sets
		// VITE_USE_POLLING=1; running directly on the machine leaves it off (polling costs CPU).
		watch: process.env.VITE_USE_POLLING ? { usePolling: true, interval: 300 } : undefined,
		proxy: {
			// Forward every API call to Fastify. That way the browser always talks
			// to the same origin, and the session cookie behaves exactly as in production.
			'/api': {
				target: API_TARGET,
				changeOrigin: false,
			},
		},
	},
})
