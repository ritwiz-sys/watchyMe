import { useEffect, useState, useCallback, useRef } from 'react'
import { socket } from '../lib/socket'
import { db } from '../lib/firebase'
import { doc, getDoc } from 'firebase/firestore'

const SERVER_URL = import.meta.env.VITE_SERVER_URL 

/* ─────────────────────────────────────────────────────────────
   useCommunities
   Just join/leave + rosters (no chat/activity feed, by design).
   - Membership (joined ids) is persisted server-side in Firestore
     (mutual array pattern, same as friends) and mirrored here from
     the user's own profile doc.
   - Online counts come from the server's live, socket-tracked
     roster (state/communities.js) — fetched on load and kept fresh
     in real time for any community this socket has joined.
   - Custom communities are created via REST and merged with the
     static built-in defs passed in.
───────────────────────────────────────────────────────────── */
export function useCommunities(user, staticDefs = []) {
  const [communities, setCommunities] = useState(staticDefs)
  const [joined,      setJoined]      = useState([])
  const [ready,        setReady]      = useState(false)

  const profileRef = useRef(null) // { id, name, avatar }

  const refreshList = useCallback(async () => {
    try {
      const res  = await fetch(`${SERVER_URL}/api/communities`)
      const data = await res.json()
      const live = data.communities || []
      const liveById = new Map(live.map(c => [c.id, c]))

      // static defs, overlaid with live counts where a doc exists
      const merged = staticDefs.map(c => {
        const l = liveById.get(c.id)
        return l ? { ...c, ...l, members: c.members, desc: c.desc, emoji: c.emoji, color: c.color } : c
      })
      // any custom (non-static) communities from the server
      const staticIds = new Set(staticDefs.map(c => c.id))
      const custom = live.filter(c => !staticIds.has(c.id)).map(c => ({
        ...c,
        members: c.memberCount ?? 0,
        active:  c.online ?? 0,
      }))

      setCommunities([...merged, ...custom])
    } catch (_) {}
  }, [staticDefs])

  useEffect(() => {
    if (!user) return

    const profile = {
      id:     user.id,
      name:   user.firstName || user.fullName || user.username || 'User',
      avatar: user.imageUrl || null,
    }
    profileRef.current = profile

    const doIdentify = () => {
      socket.emit('identify', profile, (res) => {
        if (res?.ok) setReady(true)
      })
    }

    const onConnect = () => doIdentify()
    socket.on('connect', onConnect)
    if (socket.connected) doIdentify()
    else socket.connect()

    // load this user's persisted membership from their profile doc
    getDoc(doc(db, 'users', user.id)).then(snap => {
      if (snap.exists()) setJoined(snap.data().communities || [])
    }).catch(() => {})

    refreshList()

    /* ── live roster events (only fire for communities this socket joined) ── */
    const onMemberJoined = () => refreshList()
    const onMemberLeft   = () => refreshList()

    socket.on('community:memberJoined', onMemberJoined)
    socket.on('community:memberLeft',   onMemberLeft)

    return () => {
      socket.off('connect', onConnect)
      socket.off('community:memberJoined', onMemberJoined)
      socket.off('community:memberLeft',   onMemberLeft)
    }
  }, [user, refreshList])

  /* ── actions ── */
  const joinCommunity = useCallback((id) => new Promise(resolve => {
    socket.emit('community:join', { communityId: id, profile: profileRef.current }, (res) => {
      if (res?.ok) {
        setJoined(prev => prev.includes(id) ? prev : [...prev, id])
        refreshList()
      }
      resolve(res)
    })
  }), [refreshList])

  const leaveCommunity = useCallback((id) => new Promise(resolve => {
    socket.emit('community:leave', { communityId: id }, (res) => {
      setJoined(prev => prev.filter(c => c !== id))
      refreshList()
      resolve(res)
    })
  }), [refreshList])

  const toggleCommunity = useCallback((id) => {
    return joined.includes(id) ? leaveCommunity(id) : joinCommunity(id)
  }, [joined, joinCommunity, leaveCommunity])

  const createCommunity = useCallback(async ({ name, desc, emoji, color }) => {
    const res = await fetch(`${SERVER_URL}/api/communities`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name, desc, emoji, color,
        createdBy:   user?.id,
        creatorName: user?.firstName || user?.username || 'User',
      }),
    })
    if (!res.ok) throw new Error('Could not create community')
    const { community } = await res.json()
    setCommunities(prev => [...prev, { ...community, members: 0, active: 0 }])
    await joinCommunity(community.id)
    return community
  }, [user, joinCommunity])

  return { communities, joined, ready, toggleCommunity, joinCommunity, leaveCommunity, createCommunity, refreshList }
}
