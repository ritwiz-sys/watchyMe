/* ─────────────────────────────────────────────────────────────
   In-memory presence store
   Tracks which Clerk userIds are currently connected, their
   socket, and (optionally) which room they're sitting in.
   This is separate from room membership (state/rooms.js), which
   is keyed by socket.id — this is keyed by the durable Clerk userId
   so friends can be looked up across reconnects/rooms.
───────────────────────────────────────────────────────────── */

const online = new Map() // userId → { id, socketId, name, avatar, roomCode, roomName, lastSeen }

export function setOnline(userId, info) {
  online.set(userId, { id: userId, roomCode: null, roomName: null, ...online.get(userId), ...info, lastSeen: Date.now() })
  return online.get(userId)
}

export function setOffline(userId) {
  online.delete(userId)
}

export function getOnline(userId) {
  return online.get(userId) || null
}

export function getOnlineMany(userIds = []) {
  return userIds.map(id => online.get(id)).filter(Boolean)
}

export function setRoomInfo(userId, roomCode, roomName) {
  const cur = online.get(userId)
  if (!cur) return
  cur.roomCode = roomCode
  cur.roomName = roomName
}

export function clearRoomInfo(userId) {
  const cur = online.get(userId)
  if (!cur) return
  cur.roomCode = null
  cur.roomName = null
}

export function isOnline(userId) {
  return online.has(userId)
}
