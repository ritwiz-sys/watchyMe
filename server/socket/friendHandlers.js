/* ─────────────────────────────────────────────────────────────
   Friend request handlers
   Real bidirectional friend flow backed by Firestore:
   request → accept/decline, plus remove. Live-notifies the
   other party via socket.io instead of silent unilateral writes.
───────────────────────────────────────────────────────────── */
import {
  getFriendIds, sendFriendRequestDoc, getFriendRequestDocs,
  deleteFriendRequestDoc, addMutualFriend, removeMutualFriend,
  hasIncomingRequest,
} from '../firebase/db.js'
import { getOnline } from '../state/presence.js'
import { log } from '../utils/logger.js'

export function registerFriendHandlers(io, socket) {
  /* ── SEND REQUEST ─────────────────────────────────────────── */
  socket.on('friend:request', async ({ toId, fromProfile }, cb) => {
    const fromId = socket.data.friendUserId
    if (!fromId || !toId || !fromProfile) return cb?.({ ok: false, error: 'Missing data' })
    if (fromId === toId) return cb?.({ ok: false, error: "Can't friend yourself" })

    try {
      const existingFriends = await getFriendIds(fromId)
      if (existingFriends.includes(toId)) return cb?.({ ok: false, error: 'Already friends' })

      // if the other person already sent *us* a request, auto-accept instead
      const reciprocal = await hasIncomingRequest(fromId, toId)
      if (reciprocal) {
        await addMutualFriend(fromId, toId)
        await deleteFriendRequestDoc(fromId, toId)
        await deleteFriendRequestDoc(toId, fromId)
        io.to(`user:${toId}`).emit('friend:accepted', { id: fromId, ...fromProfile })
        io.to(`user:${fromId}`).emit('friend:accepted', { id: toId })
        return cb?.({ ok: true, autoAccepted: true })
      }

      const ok = await sendFriendRequestDoc(toId, { id: fromId, ...fromProfile })
      if (!ok) return cb?.({ ok: false, error: 'Could not send request' })

      io.to(`user:${toId}`).emit('friend:request', { id: fromId, ...fromProfile })
      cb?.({ ok: true })
    } catch (e) {
      log.error('friend:request', e.message)
      cb?.({ ok: false, error: 'Server error' })
    }
  })

  /* ── ACCEPT ───────────────────────────────────────────────── */
  socket.on('friend:accept', async ({ fromId, fromProfile }, cb) => {
    const userId = socket.data.friendUserId
    if (!userId || !fromId) return cb?.({ ok: false, error: 'Missing data' })

    try {
      await addMutualFriend(userId, fromId)
      await deleteFriendRequestDoc(userId, fromId)

      io.to(`user:${fromId}`).emit('friend:accepted', { id: userId })
      cb?.({ ok: true })
    } catch (e) {
      log.error('friend:accept', e.message)
      cb?.({ ok: false, error: 'Server error' })
    }
  })

  /* ── DECLINE ──────────────────────────────────────────────── */
  socket.on('friend:decline', async ({ fromId }, cb) => {
    const userId = socket.data.friendUserId
    if (!userId || !fromId) return cb?.({ ok: false, error: 'Missing data' })

    try {
      await deleteFriendRequestDoc(userId, fromId)
      cb?.({ ok: true })
    } catch (e) {
      log.error('friend:decline', e.message)
      cb?.({ ok: false, error: 'Server error' })
    }
  })

  /* ── REMOVE / UNFRIEND ────────────────────────────────────── */
  socket.on('friend:remove', async ({ friendId }, cb) => {
    const userId = socket.data.friendUserId
    if (!userId || !friendId) return cb?.({ ok: false, error: 'Missing data' })

    try {
      await removeMutualFriend(userId, friendId)
      io.to(`user:${friendId}`).emit('friend:removed', { id: userId })
      cb?.({ ok: true })
    } catch (e) {
      log.error('friend:remove', e.message)
      cb?.({ ok: false, error: 'Server error' })
    }
  })

  /* ── LIST INCOMING REQUESTS ───────────────────────────────── */
  socket.on('friend:getRequests', async (_, cb) => {
    const userId = socket.data.friendUserId
    if (!userId) return cb?.([])
    try {
      const reqs = await getFriendRequestDocs(userId)
      cb?.(reqs)
    } catch (e) {
      log.error('friend:getRequests', e.message)
      cb?.([])
    }
  })

  /* ── LIST FRIENDS WITH LIVE ONLINE STATUS ─────────────────── */
  socket.on('friend:getList', async (_, cb) => {
    const userId = socket.data.friendUserId
    if (!userId) return cb?.([])
    try {
      const ids = await getFriendIds(userId)
      const list = ids.map(id => {
        const presence = getOnline(id)
        return {
          id,
          online: !!presence,
          name:     presence?.name     || null,
          avatar:   presence?.avatar   || null,
          roomCode: presence?.roomCode || null,
          roomName: presence?.roomName || null,
        }
      })
      cb?.(list)
    } catch (e) {
      log.error('friend:getList', e.message)
      cb?.([])
    }
  })
}
