/* ─────────────────────────────────────────────────────────────
   Firestore helpers  — rooms · messages · users
   All server-side socket handlers call these to persist data.
───────────────────────────────────────────────────────────── */
import { FieldValue } from 'firebase-admin/firestore'
import { db } from './admin.js'
import { log } from '../utils/logger.js'

/* ── ROOMS ──────────────────────────────────────────────────── */

export async function saveRoom(room) {
  try {
    await db.collection('rooms').doc(room.id).set({
      id:        room.id,
      name:      room.name,
      code:      room.code,
      hostId:    room.hostId,
      type:      room.type,
      isPrivate: room.isPrivate,
      createdAt: room.createdAt,
      memberCount: room.members.size,
      updatedAt: Date.now(),
    }, { merge: true })
  } catch (e) {
    log.error('saveRoom', e.message)
  }
}

export async function deleteRoomDoc(roomId) {
  try {
    await db.collection('rooms').doc(roomId).delete()
  } catch (e) {
    log.error('deleteRoomDoc', e.message)
  }
}

export async function getRoomByCode(code) {
  try {
    const snap = await db.collection('rooms').where('code', '==', code).limit(1).get()
    if (snap.empty) return null
    return snap.docs[0].data()
  } catch (e) {
    log.error('getRoomByCode', e.message)
    return null
  }
}

/* ── MESSAGES ───────────────────────────────────────────────── */

export async function saveMessage(roomId, msg) {
  try {
    await db
      .collection('rooms').doc(roomId)
      .collection('messages').doc(msg.id)
      .set({
        id:        msg.id,
        socketId:  msg.socketId,
        name:      msg.name,
        avatar:    msg.avatar || null,
        text:      msg.text,
        time:      msg.time,
        reactions: msg.reactions || [],
        isSystem:  msg.isSystem  || false,
      })
  } catch (e) {
    log.error('saveMessage', e.message)
  }
}

export async function getMessages(roomId, limit = 50) {
  try {
    const snap = await db
      .collection('rooms').doc(roomId)
      .collection('messages')
      .orderBy('time', 'desc')
      .limit(limit)
      .get()
    return snap.docs.map(d => d.data()).reverse()
  } catch (e) {
    log.error('getMessages', e.message)
    return []
  }
}

export async function updateReactions(roomId, msgId, reactions) {
  try {
    await db
      .collection('rooms').doc(roomId)
      .collection('messages').doc(msgId)
      .update({ reactions })
  } catch (e) {
    log.error('updateReactions', e.message)
  }
}

/* ── USER PROFILES ──────────────────────────────────────────── */

export async function upsertUser({ userId, name, avatar }) {
  try {
    await db.collection('users').doc(userId).set({
      userId,
      name,
      avatar:    avatar || null,
      updatedAt: Date.now(),
    }, { merge: true })
  } catch (e) {
    log.error('upsertUser', e.message)
  }
}

export async function getUser(userId) {
  try {
    const doc = await db.collection('users').doc(userId).get()
    return doc.exists ? doc.data() : null
  } catch (e) {
    log.error('getUser', e.message)
    return null
  }
}

/* ── FRIENDS ────────────────────────────────────────────────── */

export async function getFriendIds(userId) {
  try {
    const doc = await db.collection('users').doc(userId).get()
    return doc.exists ? (doc.data().friends || []) : []
  } catch (e) {
    log.error('getFriendIds', e.message)
    return []
  }
}

// pending friend requests *received* by userId
export async function getFriendRequestDocs(userId) {
  try {
    const snap = await db.collection('users').doc(userId)
      .collection('friendRequests').orderBy('sentAt', 'desc').get()
    return snap.docs.map(d => d.data())
  } catch (e) {
    log.error('getFriendRequestDocs', e.message)
    return []
  }
}

export async function sendFriendRequestDoc(toUserId, fromProfile) {
  try {
    await db.collection('users').doc(toUserId)
      .collection('friendRequests').doc(fromProfile.id)
      .set({ ...fromProfile, sentAt: Date.now(), status: 'pending' })
    return true
  } catch (e) {
    log.error('sendFriendRequestDoc', e.message)
    return false
  }
}

export async function hasIncomingRequest(toUserId, fromUserId) {
  try {
    const doc = await db.collection('users').doc(toUserId)
      .collection('friendRequests').doc(fromUserId).get()
    return doc.exists
  } catch {
    return false
  }
}

export async function deleteFriendRequestDoc(userId, fromUserId) {
  try {
    await db.collection('users').doc(userId)
      .collection('friendRequests').doc(fromUserId).delete()
  } catch (e) {
    log.error('deleteFriendRequestDoc', e.message)
  }
}

export async function addMutualFriend(userId, friendId) {
  try {
    await db.collection('users').doc(userId).set({ friends: FieldValue.arrayUnion(friendId) }, { merge: true })
    await db.collection('users').doc(friendId).set({ friends: FieldValue.arrayUnion(userId) }, { merge: true })
  } catch (e) {
    log.error('addMutualFriend', e.message)
  }
}

export async function removeMutualFriend(userId, friendId) {
  try {
    await db.collection('users').doc(userId).set({ friends: FieldValue.arrayRemove(friendId) }, { merge: true })
    await db.collection('users').doc(friendId).set({ friends: FieldValue.arrayRemove(userId) }, { merge: true })
  } catch (e) {
    log.error('removeMutualFriend', e.message)
  }
}

/* ── COMMUNITIES ────────────────────────────────────────────── */
// Membership is the source of truth here (arrays of userIds on the
// community doc + a mirrored array on the user doc, same mutual
// pattern as friends). Static, built-in communities and user-created
// ones are both just docs in this collection — a static id is
// lazily created on first join.

export async function getAllCommunityDocs() {
  try {
    const snap = await db.collection('communities').get()
    return snap.docs.map(d => d.data())
  } catch (e) {
    log.error('getAllCommunityDocs', e.message)
    return []
  }
}

export async function getCommunityDoc(id) {
  try {
    const doc = await db.collection('communities').doc(id).get()
    return doc.exists ? doc.data() : null
  } catch (e) {
    log.error('getCommunityDoc', e.message)
    return null
  }
}

export async function communityExists(id) {
  try {
    const doc = await db.collection('communities').doc(id).get()
    return doc.exists
  } catch {
    return false
  }
}

export async function createCommunityDoc(data) {
  try {
    await db.collection('communities').doc(data.id).set({
      ...data,
      members:   [],
      createdAt: Date.now(),
    })
    return true
  } catch (e) {
    log.error('createCommunityDoc', e.message)
    return false
  }
}

export async function addCommunityMember(communityId, userId) {
  try {
    await db.collection('communities').doc(communityId)
      .set({ id: communityId, members: FieldValue.arrayUnion(userId) }, { merge: true })
    await db.collection('users').doc(userId)
      .set({ communities: FieldValue.arrayUnion(communityId) }, { merge: true })
    return true
  } catch (e) {
    log.error('addCommunityMember', e.message)
    return false
  }
}

export async function removeCommunityMember(communityId, userId) {
  try {
    await db.collection('communities').doc(communityId)
      .set({ members: FieldValue.arrayRemove(userId) }, { merge: true })
    await db.collection('users').doc(userId)
      .set({ communities: FieldValue.arrayRemove(communityId) }, { merge: true })
    return true
  } catch (e) {
    log.error('removeCommunityMember', e.message)
    return false
  }
}

/* ── GAME HISTORY ───────────────────────────────────────────── */

export async function saveGameResult(roomId, game) {
  try {
    await db
      .collection('rooms').doc(roomId)
      .collection('gameHistory')
      .add({
        type:      game.type,
        scores:    game.scores,
        endedAt:   Date.now(),
      })
  } catch (e) {
    log.error('saveGameResult', e.message)
  }
}
