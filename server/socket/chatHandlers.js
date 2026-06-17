import { getRoom } from '../state/rooms.js'
import { log } from '../utils/logger.js'
import { saveMessage, updateReactions } from '../firebase/db.js'

const MAX_MESSAGES = 200
const RATE_LIMIT_MS = 500          // min ms between messages per socket
const lastSent = new Map()          // socketId → timestamp

export function registerChatHandlers(io, socket) {

  /* ── SEND MESSAGE ─────────────────────────────────────────── */
  socket.on('sendMessage', ({ text }, cb) => {
    try {
      const room = getRoom(socket.data.roomId)
      if (!room) return cb?.({ ok: false, error: 'Not in a room' })

      const trimmed = text?.trim()
      if (!trimmed || trimmed.length > 500) return cb?.({ ok: false, error: 'Invalid message' })

      // rate limit
      const now  = Date.now()
      const last = lastSent.get(socket.id) || 0
      if (now - last < RATE_LIMIT_MS) return cb?.({ ok: false, error: 'Too fast' })
      lastSent.set(socket.id, now)

      const msg = {
        id:        crypto.randomUUID(),
        socketId:  socket.id,
        name:      socket.data.member?.name || 'Unknown',
        avatar:    socket.data.member?.avatar || null,
        text:      trimmed,
        time:      now,
        reactions: [],
      }

      room.messages.push(msg)
      if (room.messages.length > MAX_MESSAGES) room.messages.shift()

      io.to(room.id).emit('newMessage', msg)
      saveMessage(room.id, msg)   // persist to Firestore (non-blocking)
      cb?.({ ok: true, msgId: msg.id })
    } catch (e) {
      log.error('sendMessage', e.message)
      cb?.({ ok: false, error: 'Server error' })
    }
  })

  /* ── REACT TO MESSAGE ─────────────────────────────────────── */
  socket.on('reactMessage', ({ msgId, emoji }, cb) => {
    try {
      const room = getRoom(socket.data.roomId)
      if (!room) return cb?.({ ok: false, error: 'Not in a room' })

      const ALLOWED_EMOJI = ['👍','❤️','😂','😮','🔥','🚀','👏','💯']
      if (!ALLOWED_EMOJI.includes(emoji)) return cb?.({ ok: false, error: 'Invalid emoji' })

      const msg = room.messages.find(m => m.id === msgId)
      if (!msg) return cb?.({ ok: false, error: 'Message not found' })

      const existing = msg.reactions.find(r => r.e === emoji)
      if (existing) existing.n++
      else msg.reactions.push({ e: emoji, n: 1 })

      io.to(room.id).emit('messageReacted', { msgId, reactions: msg.reactions })
      updateReactions(room.id, msgId, msg.reactions)   // persist
      cb?.({ ok: true })
    } catch (e) {
      log.error('reactMessage', e.message)
    }
  })

  /* ── TYPING INDICATOR ─────────────────────────────────────── */
  socket.on('typing', ({ isTyping }) => {
    const room = getRoom(socket.data.roomId)
    if (!room) return
    socket.to(room.id).emit('typingUpdate', {
      socketId: socket.id,
      name:     socket.data.member?.name || 'Someone',
      isTyping: Boolean(isTyping),
    })
  })

  /* ── SYSTEM MESSAGE helper (used by other handlers) ─────────*/
  socket.systemMsg = (text) => {
    const room = getRoom(socket.data.roomId)
    if (!room) return
    const msg = {
      id:        crypto.randomUUID(),
      socketId:  'system',
      name:      'System',
      avatar:    null,
      text,
      time:      Date.now(),
      reactions: [],
      isSystem:  true,
    }
    room.messages.push(msg)
    io.to(room.id).emit('newMessage', msg)
  }
}
