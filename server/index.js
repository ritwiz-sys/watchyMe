import 'dotenv/config'
import express from 'express'
import { createServer } from 'http'
import cors from 'cors'
import { initSocket } from './socket/index.js'
import roomRoutes       from './routes/rooms.js'
import livekitRoutes    from './routes/livekit.js'
import communityRoutes  from './routes/communities.js'
import { log } from './utils/logger.js'

const PORT       = process.env.PORT       || 4000
const CLIENT_URL = process.env.CLIENT_URL || 'http://localhost:5173'

/* ── express ─────────────────────────────────────────────────── */
const app = express()
app.use(cors({ origin: CLIENT_URL }))
app.use(express.json())

// silence Chrome DevTools probes
app.get('/.well-known/appspecific/com.chrome.devtools.json', (_req, res) => res.json({}))

app.get('/',        (_req, res) => res.json({ app: 'WatchyMe Server', version: '1.0.0', status: 'running' }))
app.get('/health',  (_req, res) => res.json({ ok: true, uptime: process.uptime() }))

app.use('/api/rooms',       roomRoutes)
app.use('/api/livekit',     livekitRoutes)
app.use('/api/communities', communityRoutes)

// 404 fallback
app.use((_req, res) => res.status(404).json({ error: 'Not found' }))

/* ── socket.io ───────────────────────────────────────────────── */
const httpServer = createServer(app)
initSocket(httpServer, CLIENT_URL)

/* ── start ───────────────────────────────────────────────────── */
httpServer.listen(PORT, () => {
  log.ok(`\n  🚀 WatchyMe server  →  http://localhost:${PORT}`)
  log.ok(`  📡 Socket.io ready`)
  log.ok(`  🌐 Accepting connections from ${CLIENT_URL}\n`)
})
