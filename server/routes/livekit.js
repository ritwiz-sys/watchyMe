import { Router }      from 'express'
import { AccessToken } from 'livekit-server-sdk'

const router = Router()

/* GET /api/livekit/token?room=CODE&identity=SOCKET_ID&name=DisplayName */
router.get('/token', async (req, res) => {
  const { room, identity, name } = req.query

  if (!room || !identity) {
    return res.status(400).json({ error: 'room and identity are required' })
  }

  const apiKey    = process.env.LIVEKIT_API_KEY
  const apiSecret = process.env.LIVEKIT_API_SECRET

  if (!apiKey || !apiSecret) {
    return res.status(503).json({ error: 'LiveKit not configured on this server — add LIVEKIT_API_KEY and LIVEKIT_API_SECRET to server/.env' })
  }

  try {
    const at = new AccessToken(apiKey, apiSecret, {
      identity,
      name: name || identity,
      ttl:  '4h',
    })

    at.addGrant({
      roomJoin:       true,
      room,
      canPublish:     true,
      canSubscribe:   true,
      canPublishData: true,
    })

    const token = await at.toJwt()
    res.json({ token })
  } catch (e) {
    console.error('LiveKit token error:', e.message)
    res.status(500).json({ error: 'Failed to generate token' })
  }
})

export default router
