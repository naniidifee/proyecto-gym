import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import createMemberAccount from './api/create-member-account.js'
import inviteReceptionist from './api/invite-receptionist.js'
import registerMember from './api/register-member.js'

// Reutiliza las mismas funciones protegidas que Vercel durante npm run dev.
function localVercelApi() {
  return {
    name: 'gymcontrol-local-api',
    configureServer(server) {
      const env = loadEnv(server.config.mode, server.config.root, '')
      for (const key of ['VITE_SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'PUBLIC_APP_URL']) {
        if (!process.env[key] && env[key]) process.env[key] = env[key]
      }
      for (const [route, handler] of [
        ['/api/create-member-account', createMemberAccount],
        ['/api/register-member', registerMember],
        ['/api/invite-receptionist', inviteReceptionist]
      ]) {
        server.middlewares.use(route, async (req, res) => {
          res.status = (code) => { res.statusCode = code; return res }
          res.json = (value) => { res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(value)); return res }
          try {
            if (req.method !== 'POST') { await handler(req, res); return }
            const parts = []
            let size = 0
            for await (const part of req) {
              size += part.length
              if (size > 10000) { res.status(413).json({ error: 'Formulario demasiado grande' }); return }
              parts.push(part)
            }
            req.body = JSON.parse(Buffer.concat(parts).toString('utf8') || '{}')
            await handler(req, res)
          } catch {
            if (!res.writableEnded) res.status(400).json({ error: 'Solicitud inválida' })
          }
        })
      }
    }
  }
}
export default defineConfig({ plugins: [react(), localVercelApi()], server: { port: 5173, strictPort: true } })
