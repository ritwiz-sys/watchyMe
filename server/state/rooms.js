/* ─────────────────────────────────────────────────────────────
   In-memory room store
   All room data lives here; no DB for now.
───────────────────────────────────────────────────────────── */

const rooms = new Map()   // roomId → Room

// ── types (JSDoc for IDE hints) ───────────────────────────────
/**
 * @typedef {{ socketId:string, userId:string, name:string, avatar:string,
 *             muted:boolean, camOff:boolean, speaking:boolean, joinedAt:number }} Member
 *
 * @typedef {{ id:string, name:string, code:string, hostId:string, type:string,
 *             isPrivate:boolean, createdAt:number, watchVideo:WatchState|null,
 *             members:Map<string,Member>, messages:object[], game:object|null }} Room
 *
 * @typedef {{ kind:'youtube'|'direct', videoId:string|null, url:string|null,
 *             playing:boolean, currentTime:number, updatedAt:number }} WatchState
 */

// ── helpers ───────────────────────────────────────────────────
export function makeCode() {
  return 'WM-' + Math.random().toString(36).slice(2, 6).toUpperCase()
}

export function makeId() {
  return crypto.randomUUID()
}

// ── CRUD ──────────────────────────────────────────────────────
export function createRoom({ roomName, type = 'watchparty', isPrivate = true }) {
  const id = makeId()
  /** @type {Room} */
  const room = {
    id,
    name:       roomName,
    code:       makeCode(),
    hostId:     null,
    type,
    isPrivate,
    createdAt:  Date.now(),
    watchVideo: null,
    members:    new Map(),
    messages:   [],
    game:       null,
  }
  rooms.set(id, room)
  return room
}

export function getRoom(roomId)           { return rooms.get(roomId) }
export function getRoomByCode(code)       { return [...rooms.values()].find(r => r.code === code) }
export function deleteRoom(roomId)        { rooms.delete(roomId) }
export function getAllRooms()             { return [...rooms.values()] }
export function roomCount()              { return rooms.size }

// ── member ops ───────────────────────────────────────────────
export function addMember(room, member)   { room.members.set(member.socketId, member) }
export function removeMember(room, socketId) { room.members.delete(socketId) }
export function getMember(room, socketId) { return room.members.get(socketId) }
export function getMembers(room)          { return [...room.members.values()] }

export function patchMember(room, socketId, patch) {
  const m = room.members.get(socketId)
  if (!m) return null
  Object.assign(m, patch)
  return m
}

// ── serialise (safe to send over the wire) ───────────────────
export function serialiseRoom(room) {
  return {
    id:         room.id,
    name:       room.name,
    code:       room.code,
    hostId:     room.hostId,
    type:       room.type,
    isPrivate:  room.isPrivate,
    createdAt:  room.createdAt,
    watchVideo: room.watchVideo,
    members:    getMembers(room),
    messages:   room.messages.slice(-50),   // last 50 on join
    game:       room.game,
  }
}
