import {
  createRoom, getRoom, getRoomByCode, deleteRoom,
  addMember, removeMember, getMember, patchMember,
  getMembers, serialiseRoom, makeId,
} from '../state/rooms.js'
import { log } from '../utils/logger.js'
import { saveRoom, deleteRoomDoc, upsertUser } from '../firebase/db.js'

export function registerRoomHandlers(io, socket) {

  /* ── CREATE ROOM ──────────────────────────────────────────── */
  socket.on('createRoom', ({ name, avatar, roomName, type, isPrivate }, cb) => {
    try {
      if (!name?.trim() || !roomName?.trim()) return cb?.({ ok: false, error: 'name and roomName required' })

      const room   = createRoom({ roomName: roomName.trim(), type, isPrivate })
      const member = {
        socketId: socket.id, userId: socket.id,
        name: name.trim(), avatar: avatar || null,
        muted: false, camOff: false, speaking: false,
        joinedAt: Date.now(),
      }

      room.hostId = socket.id
      addMember(room, member)
      saveRoom(room)          // persist to Firestore
      upsertUser({ userId: socket.id, name: name.trim(), avatar: avatar || null })

      socket.join(room.id)
      socket.data.roomId = room.id
      socket.data.member = member

      log.room(`created  ${room.code}  "${room.name}"  by ${name}`)
      cb?.({ ok: true, room: serialiseRoom(room) })
    } catch (e) {
      log.error('createRoom', e.message)
      cb?.({ ok: false, error: 'Server error' })
    }
  })

  /* ── JOIN ROOM by CODE ────────────────────────────────────── */
  socket.on('joinRoom', ({ code, name, avatar }, cb) => {
    try {
      if (!code?.trim() || !name?.trim()) return cb?.({ ok: false, error: 'code and name required' })

      const room = getRoomByCode(code.trim().toUpperCase())
      if (!room) return cb?.({ ok: false, error: 'Room not found' })

      // Re-join: socket already in this room (creator coming from Home, or reconnect)
      const existing = getMember(room, socket.id)
      if (existing) {
        socket.join(room.id)
        socket.data.roomId = room.id
        socket.data.member = existing
        log.room(`${name} re-joined  ${room.code}`)
        return cb?.({ ok: true, room: serialiseRoom(room) })
      }

      if (room.members.size >= 20) return cb?.({ ok: false, error: 'Room is full (max 20)' })

      const member = {
        socketId: socket.id, userId: socket.id,
        name: name.trim(), avatar: avatar || null,
        muted: false, camOff: false, speaking: false,
        joinedAt: Date.now(),
      }
      addMember(room, member)
      saveRoom(room)          // update member count in Firestore
      upsertUser({ userId: socket.id, name: name.trim(), avatar: avatar || null })

      socket.join(room.id)
      socket.data.roomId = room.id
      socket.data.member = member

      // tell everyone else
      socket.to(room.id).emit('memberJoined', member)

      log.room(`${name} joined  ${room.code}`)
      cb?.({ ok: true, room: serialiseRoom(room) })
    } catch (e) {
      log.error('joinRoom', e.message)
      cb?.({ ok: false, error: 'Server error' })
    }
  })

  /* ── LEAVE ROOM (manual) ──────────────────────────────────── */
  socket.on('leaveRoom', () => handleLeave(io, socket))

  /* ── MEMBER STATUS (mute / cam / speaking) ────────────────── */
  socket.on('updateStatus', (patch) => {
    const room = getRoom(socket.data.roomId)
    if (!room) return

    const allowed = {}
    if (patch.muted    !== undefined) allowed.muted    = Boolean(patch.muted)
    if (patch.camOff   !== undefined) allowed.camOff   = Boolean(patch.camOff)
    if (patch.speaking !== undefined) allowed.speaking = Boolean(patch.speaking)

    patchMember(room, socket.id, allowed)
    socket.to(room.id).emit('memberUpdated', { socketId: socket.id, ...allowed })
  })

  /* ── TRANSFER HOST ────────────────────────────────────────── */
  socket.on('transferHost', ({ toSocketId }, cb) => {
    const room = getRoom(socket.data.roomId)
    if (!room)                           return cb?.({ ok: false, error: 'Not in a room' })
    if (room.hostId !== socket.id)       return cb?.({ ok: false, error: 'Only host can transfer' })
    if (!getMember(room, toSocketId))    return cb?.({ ok: false, error: 'Target not in room' })

    room.hostId = toSocketId
    io.to(room.id).emit('hostChanged', { hostId: toSocketId })
    log.room(`host transferred → ${toSocketId}  in ${room.code}`)
    cb?.({ ok: true })
  })

  /* ── DISCONNECT ───────────────────────────────────────────── */
  socket.on('disconnect', () => handleLeave(io, socket))
}

/* ── shared leave logic ──────────────────────────────────────── */
export function handleLeave(io, socket) {
  const roomId = socket.data.roomId
  if (!roomId) return

  const room = getRoom(roomId)
  if (!room) return

  const name = socket.data.member?.name || socket.id
  removeMember(room, socket.id)
  socket.leave(roomId)
  socket.data.roomId = null

  if (room.members.size === 0) {
    deleteRoom(roomId)
    deleteRoomDoc(roomId)   // remove from Firestore
    log.room(`deleted (empty)  ${room.code}`)
    return
  }

  // auto-transfer host
  if (room.hostId === socket.id) {
    room.hostId = room.members.keys().next().value
    io.to(roomId).emit('hostChanged', { hostId: room.hostId })
  }

  io.to(roomId).emit('memberLeft', { socketId: socket.id, name })
  log.room(`${name} left  ${room.code}  (${room.members.size} remaining)`)
}
