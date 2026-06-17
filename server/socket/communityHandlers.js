/* ─────────────────────────────────────────────────────────────
   Community handlers
   Join/leave a community: persists mutual membership in Firestore
   (firebase/db.js) AND tracks a live, server-side roster of who is
   currently online in that community (state/communities.js),
   broadcasting roster changes in real time. No chat/activity feed —
   just join/leave + rosters, by design.
───────────────────────────────────────────────────────────── */
import { addCommunityMember, removeCommunityMember } from '../firebase/db.js'
import { joinRoster, leaveRoster, getRoster, leaveAllRosters } from '../state/communities.js'
import { log } from '../utils/logger.js'

export function registerCommunityHandlers(io, socket) {
  // communities this socket has live-joined (for disconnect cleanup)
  socket.data.communities = socket.data.communities || new Set()

  /* ── JOIN ─────────────────────────────────────────────────── */
  socket.on('community:join', async ({ communityId, profile } = {}, cb) => {
    const userId = socket.data.friendUserId
    if (!userId || !communityId) return cb?.({ ok: false, error: 'Not identified' })

    try {
      await addCommunityMember(communityId, userId)

      joinRoster(communityId, userId, {
        name:     profile?.name   || 'User',
        avatar:   profile?.avatar || null,
        socketId: socket.id,
      })
      socket.join(`community:${communityId}`)
      socket.data.communities.add(communityId)

      io.to(`community:${communityId}`).emit('community:memberJoined', {
        id: userId, name: profile?.name || 'User', avatar: profile?.avatar || null,
      })

      cb?.({ ok: true, roster: getRoster(communityId) })
    } catch (e) {
      log.error('community:join', e.message)
      cb?.({ ok: false, error: 'Server error' })
    }
  })

  /* ── LEAVE ────────────────────────────────────────────────── */
  socket.on('community:leave', async ({ communityId } = {}, cb) => {
    const userId = socket.data.friendUserId
    if (!userId || !communityId) return cb?.({ ok: false, error: 'Not identified' })

    try {
      await removeCommunityMember(communityId, userId)

      leaveRoster(communityId, userId)
      socket.leave(`community:${communityId}`)
      socket.data.communities.delete(communityId)

      io.to(`community:${communityId}`).emit('community:memberLeft', { id: userId })
      cb?.({ ok: true })
    } catch (e) {
      log.error('community:leave', e.message)
      cb?.({ ok: false, error: 'Server error' })
    }
  })

  /* ── GET LIVE ROSTER ─────────────────────────────────────────── */
  socket.on('community:getRoster', ({ communityId } = {}, cb) => {
    cb?.(communityId ? getRoster(communityId) : [])
  })

  /* ── DISCONNECT — drop this socket from any live rosters ───── */
  socket.on('disconnect', () => {
    const userId = socket.data.friendUserId
    if (!userId || socket.data.communities.size === 0) return

    const affected = leaveAllRosters(userId, [...socket.data.communities])
    affected.forEach(id => io.to(`community:${id}`).emit('community:memberLeft', { id: userId }))
    socket.data.communities.clear()
  })
}
