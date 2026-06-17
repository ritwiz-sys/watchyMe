/* ─────────────────────────────────────────────────────────────
   In-memory community roster store
   Tracks who is *currently online and viewing* each community —
   separate from persisted Firestore membership (firebase/db.js).
   Keyed by communityId → Map(userId → { id, name, avatar, socketId }).
───────────────────────────────────────────────────────────── */

const rosters = new Map() // communityId → Map(userId → member)

function rosterFor(communityId) {
  if (!rosters.has(communityId)) rosters.set(communityId, new Map())
  return rosters.get(communityId)
}

export function joinRoster(communityId, userId, info) {
  const roster = rosterFor(communityId)
  roster.set(userId, { id: userId, ...info })
  return roster.get(userId)
}

export function leaveRoster(communityId, userId) {
  const roster = rosters.get(communityId)
  if (!roster) return
  roster.delete(userId)
  if (roster.size === 0) rosters.delete(communityId)
}

export function getRoster(communityId) {
  const roster = rosters.get(communityId)
  return roster ? [...roster.values()] : []
}

export function getRosterCount(communityId) {
  return rosters.get(communityId)?.size || 0
}

// remove a user from every community roster they're currently in
// (called on socket disconnect) — returns the list of affected ids
export function leaveAllRosters(userId, communityIds = []) {
  const affected = []
  for (const id of communityIds) {
    const roster = rosters.get(id)
    if (roster?.has(userId)) {
      roster.delete(userId)
      if (roster.size === 0) rosters.delete(id)
      affected.push(id)
    }
  }
  return affected
}
