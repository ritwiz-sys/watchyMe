import { useEffect, useState, useCallback, useRef } from 'react'
import { socket } from '../lib/socket'

/* ─────────────────────────────────────────────────────────────
   useFriends
   Real-time friends layer: identifies this socket with the
   user's durable Clerk userId, tracks live online/offline
   presence for friends, and exposes a request/accept/decline/
   remove flow backed by the server's Firestore-backed handlers.
───────────────────────────────────────────────────────────── */
export function useFriends(user) {
  const [friends,  setFriends]  = useState([])   // [{id,name,avatar,online,roomCode,roomName}]
  const [requests, setRequests] = useState([])   // incoming pending requests
  const [ready,    setReady]    = useState(false)

  const profileRef = useRef(null) // { id, name, avatar } — used when sending requests

  const refreshFriends = useCallback(() => {
    socket.emit('friend:getList', null, (list) => setFriends(list || []))
  }, [])

  const refreshRequests = useCallback(() => {
    socket.emit('friend:getRequests', null, (list) => setRequests(list || []))
  }, [])

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
        if (res?.ok) {
          setReady(true)
          refreshFriends()
          refreshRequests()
        }
      })
    }

    const onConnect = () => doIdentify()

    socket.on('connect', onConnect)
    if (socket.connected) doIdentify()
    else socket.connect()

    /* ── live presence + request events ── */
    const onFriendOnline = (f) => setFriends(prev => prev.map(p => p.id === f.id ? { ...p, online: true, name: f.name || p.name, avatar: f.avatar || p.avatar } : p))
    const onFriendOffline = ({ id }) => setFriends(prev => prev.map(p => p.id === id ? { ...p, online: false, roomCode: null, roomName: null } : p))
    const onFriendRequest = (req) => setRequests(prev => prev.some(r => r.id === req.id) ? prev : [req, ...prev])
    const onFriendAccepted = () => { refreshFriends(); refreshRequests() }
    const onFriendRemoved = ({ id }) => setFriends(prev => prev.filter(f => f.id !== id))

    socket.on('friend:online',    onFriendOnline)
    socket.on('friend:offline',   onFriendOffline)
    socket.on('friend:request',   onFriendRequest)
    socket.on('friend:accepted',  onFriendAccepted)
    socket.on('friend:removed',   onFriendRemoved)

    return () => {
      socket.off('connect', onConnect)
      socket.off('friend:online',   onFriendOnline)
      socket.off('friend:offline',  onFriendOffline)
      socket.off('friend:request',  onFriendRequest)
      socket.off('friend:accepted', onFriendAccepted)
      socket.off('friend:removed',  onFriendRemoved)
    }
  }, [user, refreshFriends, refreshRequests])

  /* ── actions ── */
  const sendRequest = useCallback((toId, toProfile) => new Promise(resolve => {
    socket.emit('friend:request', { toId, fromProfile: profileRef.current }, (res) => {
      if (res?.ok && res.autoAccepted) refreshFriends()
      resolve(res)
    })
  }), [refreshFriends])

  const acceptRequest = useCallback((fromId) => new Promise(resolve => {
    socket.emit('friend:accept', { fromId }, (res) => {
      setRequests(prev => prev.filter(r => r.id !== fromId))
      if (res?.ok) refreshFriends()
      resolve(res)
    })
  }), [refreshFriends])

  const declineRequest = useCallback((fromId) => new Promise(resolve => {
    socket.emit('friend:decline', { fromId }, (res) => {
      setRequests(prev => prev.filter(r => r.id !== fromId))
      resolve(res)
    })
  }), [])

  const removeFriend = useCallback((friendId) => new Promise(resolve => {
    setFriends(prev => prev.filter(f => f.id !== friendId))
    socket.emit('friend:remove', { friendId }, (res) => resolve(res))
  }), [])

  return { friends, requests, ready, sendRequest, acceptRequest, declineRequest, removeFriend, refreshFriends, refreshRequests }
}
