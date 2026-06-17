import { Router } from 'express'
import { getAllRooms, getRoomByCode, getMembers, roomCount } from '../state/rooms.js'

const router = Router()

/* GET /api/rooms — list all active PUBLIC rooms (used by Home page) */
router.get('/', (_req, res) => {
  const allRooms    = getAllRooms()
  const publicRooms = allRooms
    .filter(r => !r.isPrivate)
    .map(r => ({
      id:          r.id,
      name:        r.name,
      code:        r.code,
      type:        r.type,
      memberCount: r.members.size,
      members:     getMembers(r).map(m => ({ name: m.name, avatar: m.avatar || null })),
      hasGame:     Boolean(r.game),
      hasVideo:    Boolean(r.watchVideo),
      createdAt:   r.createdAt,
    }))
    .sort((a, b) => b.memberCount - a.memberCount)   // most active first

  res.json({ rooms: publicRooms, total: allRooms.length })
})

/* GET /api/rooms/stats */
router.get('/stats', (_req, res) => {
  res.json({
    totalRooms:   roomCount(),
    totalMembers: getAllRooms().reduce((n, r) => n + r.members.size, 0),
  })
})

/* GET /api/rooms/:code — check if a room exists before joining */
router.get('/:code', (req, res) => {
  const room = getRoomByCode(req.params.code.toUpperCase())
  if (!room) return res.status(404).json({ error: 'Room not found' })

  res.json({
    id:          room.id,
    name:        room.name,
    code:        room.code,
    type:        room.type,
    isPrivate:   room.isPrivate,
    memberCount: room.members.size,
    hasGame:     Boolean(room.game),
    hasVideo:    Boolean(room.watchVideo),
  })
})

export default router
