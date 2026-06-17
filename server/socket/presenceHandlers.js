/* ─────────────────────────────────────────────────────────────
   Presence handlers
   Binds a socket to a real Clerk userId ("identify"), broadcasts
   online/offline status to that user's friends, and tracks which
   room (if any) the user is currently in.
───────────────────────────────────────────────────────────── */
import { setOnline, setOffline, getOnlineMany } from '../state/presence.js'
import { getFriendIds } from '../firebase/db.js'
import { log } from '../utils/logger.js'

// userId → Set<socket.id>   (a user can have multiple tabs/sockets open)
const socketsByUser = new Map()

function addUserSocket(userId, socketId) {
  if (!socketsByUser.has(userId)) socketsByUser.set(userId, new Set())
  socketsByUser.get(userId).add(socketId)
}
function removeUserSocket(userId, socketId) {
  const set = socketsByUser.get(userId)
  if (!set) return
  set.delete(socketId)
  if (set.size === 0) socketsByUser.delete(userId)
}
function userStillConnected(userId) {
  return (socketsByUser.get(userId)?.size || 0) > 0
}

export function registerPresenceHandlers(io, socket) {
  /* ── IDENTIFY ─────────────────────────────────────────────── */
  // client calls this right after connecting, trusted the same
  // way joinRoom trusts the client-supplied name/avatar.
  socket.on('identify', async ({ userId, name, avatar }, cb) => {
    if (!userId) return cb?.({ ok: false, error: 'No userId provided' })

    socket.data.friendUserId = userId
    addUserSocket(userId, socket.id)
    setOnline(userId, { socketId: socket.id, name, avatar })

    // tell this user's friends they're now online
    try {
      const friendIds = await getFriendIds(userId)
      friendIds.forEach(fid => {
        io.to(`user:${fid}`).emit('friend:online', { id: userId, name, avatar })
      })
      // join a personal room so friends/requests can target this user directly
      socket.join(`user:${userId}`)
    } catch (e) {
      log.error('identify', e.message)
    }

    cb?.({ ok: true })
  })

  /* ── presence:setRoom — let friends see what room you're in ── */
  socket.on('presence:setRoom', ({ roomCode, roomName }) => {
    const userId = socket.data.friendUserId
    if (!userId) return
    setOnline(userId, { roomCode: roomCode || null, roomName: roomName || null })
  })

  /* ── bulk lookup: "who among these userIds is online?" ──────── */
  socket.on('presence:getMany', (userIds = [], cb) => {
    cb?.(getOnlineMany(userIds))
  })

  /* ── DISCONNECT ───────────────────────────────────────────── */
  socket.on('disconnect', async () => {
    const userId = socket.data.friendUserId
    if (!userId) return
    removeUserSocket(userId, socket.id)

    // only mark fully offline once their last socket disconnects
    if (!userStillConnected(userId)) {
      setOffline(userId)
      try {
        const friendIds = await getFriendIds(userId)
        friendIds.forEach(fid => {
          io.to(`user:${fid}`).emit('friend:offline', { id: userId })
        })
      } catch (e) {
        log.error('presence disconnect', e.message)
      }
    }
  })
}
