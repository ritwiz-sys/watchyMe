import 'dotenv/config'
import express from 'express'
import { createServer } from 'http'
import cors from 'cors'
import { initSocket } from './socket/index.js'
import roomRoutes       from './routes/rooms.js'
import livekitRoutes    from './routes/livekit.js'
import communityRoutes  from './routes/communities.js'
import { log } from './utils/logger.js'

const PORT = process.env.PORT || 4000

// CLIENT_URL may be a single origin or a comma-separated list
// (e.g. "http://localhost:5173,https://watchyme.netlify.app")
// so the same server can accept both local dev and the deployed site.
const CLIENT_URLS = (process.env.CLIENT_URL || 'http://localhost:5173')
  .split(',')
  .map(s => s.trim())
  .filter(Boolean)

// Netlify gives every deploy (production + previews + branch deploys) its
// own subdomain, e.g. https://<hash>--watchyme.netlify.app, in addition to
// the stable https://watchyme.netlify.app. Build a regex per *.netlify.app
// base domain found in CLIENT_URLS so all of its deploy URLs are allowed too.
const NETLIFY_PATTERNS = CLIENT_URLS
  .filter(u => /\.netlify\.app$/.test(new URL(u).hostname))
  .map(u => {
    const host = new URL(u).hostname // e.g. watchyme.netlify.app
    const escaped = host.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    return new RegExp(`^https:\\/\\/([a-z0-9-]+--)?${escaped}$`)
  })

const corsOriginCheck = (origin, cb) => {
  // no origin = same-origin / curl / server-to-server — allow
  if (!origin) return cb(null, true)
  if (CLIENT_URLS.includes(origin)) return cb(null, true)
  if (NETLIFY_PATTERNS.some(re => re.test(origin))) return cb(null, true)
  cb(new Error(`Origin ${origin} not allowed by CORS`))
}

/* ── express ─────────────────────────────────────────────────── */
const app = express()
app.use(cors({ origin: corsOriginCheck }))
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
initSocket(httpServer, CLIENT_URLS)

/* ── start ───────────────────────────────────────────────────── */
httpServer.listen(PORT, () => {
  log.ok(`\n  🚀 WatchyMe server  →  http://localhost:${PORT}`)
  log.ok(`  📡 Socket.io ready`)
  log.ok(`  🌐 Accepting connections from ${CLIENT_URLS.join(', ')}\n`)
})
