import { useEffect, useState, useRef, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { useUser } from '@clerk/clerk-react'
import { socket } from '../lib/socket'

export function useRoom(code) {
  const { user } = useUser()
  const nav      = useNavigate()

  const [connected,  setConnected]  = useState(false)
  const [roomData,   setRoomData]   = useState(null)
  const [members,    setMembers]    = useState([])
  const [messages,   setMessages]   = useState([])
  const [game,       setGame]       = useState(null)
  const [watchVideo, setWatchVideo] = useState(null)
  const [error,      setError]      = useState(null)

  // prevent double-cleanup from re-renders
  const didLeave = useRef(false)

  useEffect(() => {
    if (!user) return
    didLeave.current = false

    /* ── called once we have a live socket connection ── */
    const doJoin = () => {
      setConnected(true)
      socket.emit('joinRoom', {
        code:   code?.toUpperCase(),
        name:   user.firstName || user.username || 'User',
        avatar: user.imageUrl  || null,
      }, (res) => {
        if (!res.ok) {
          setError(res.error || 'Could not join room')
          nav('/home')
          return
        }
        const r = res.room
        setRoomData({
          id: r.id, name: r.name, code: r.code,
          hostId: r.hostId, type: r.type, isPrivate: r.isPrivate,
        })
        setMembers(r.members   || [])
        setMessages(r.messages || [])
        setGame(r.game         || null)
        setWatchVideo(r.watchVideo || null)

        // let friends see this user is now in a room (no-op if not identified)
        socket.emit('presence:setRoom', { roomCode: r.code, roomName: r.name })
      })
    }

    /* ── register handlers BEFORE connecting ── */
    const onConnect    = () => doJoin()
    const onDisconnect = () => setConnected(false)

    socket.on('connect',    onConnect)
    socket.on('disconnect', onDisconnect)

    // room events
    socket.on('memberJoined',  (m)    => setMembers(p => [...p, m]))
    socket.on('memberLeft',    ({socketId}) => setMembers(p => p.filter(m => m.socketId !== socketId)))
    socket.on('memberUpdated', (patch) => setMembers(p =>
      p.map(m => m.socketId === patch.socketId ? { ...m, ...patch } : m)
    ))
    socket.on('hostChanged',   ({ hostId }) => setRoomData(r => r ? { ...r, hostId } : r))

    // chat
    socket.on('newMessage',    (msg)  => setMessages(p => [...p, msg]))
    socket.on('messageReacted',({ msgId, reactions }) =>
      setMessages(p => p.map(m => m.id === msgId ? { ...m, reactions } : m))
    )

    // game
    socket.on('gameStarted', (g) => setGame(g))
    socket.on('gameUpdated', (g) => setGame({ ...g }))
    socket.on('gameEnded',   (g) => setGame({ ...g, phase: 'results' }))
    socket.on('gameStopped', ()  => setGame(null))

    // watch
    socket.on('videoChanged', (v)              => setWatchVideo(v))
    socket.on('videoPlay',    ({ currentTime }) => setWatchVideo(v => v ? { ...v, playing: true,  currentTime } : v))
    socket.on('videoPause',   ({ currentTime }) => setWatchVideo(v => v ? { ...v, playing: false, currentTime } : v))
    socket.on('videoSeek',    ({ currentTime }) => setWatchVideo(v => v ? { ...v, currentTime } : v))

    /* ── connect or join immediately if already connected ── */
    if (socket.connected) {
      doJoin()
    } else {
      socket.connect()
    }

    return () => {
      if (!didLeave.current) {
        didLeave.current = true
        socket.emit('leaveRoom')
        // let friends see this user is back online (not in a room) —
        // no-op if not identified. NOTE: we deliberately do NOT call
        // socket.disconnect() here: the friends-presence layer
        // (useFriends) relies on this same shared socket staying
        // connected even after leaving a room.
        socket.emit('presence:setRoom', { roomCode: null, roomName: null })
      }

      socket.off('connect',       onConnect)
      socket.off('disconnect',    onDisconnect)
      socket.off('memberJoined')
      socket.off('memberLeft')
      socket.off('memberUpdated')
      socket.off('hostChanged')
      socket.off('newMessage')
      socket.off('messageReacted')
      socket.off('gameStarted')
      socket.off('gameUpdated')
      socket.off('gameEnded')
      socket.off('gameStopped')
      socket.off('videoChanged')
      socket.off('videoPlay')
      socket.off('videoPause')
      socket.off('videoSeek')
    }
  }, [code, user])

  /* ── actions ── */
  const sendMessage  = useCallback((text)       => socket.emit('sendMessage', { text }), [])
  const reactMessage = useCallback((msgId, emoji) => socket.emit('reactMessage', { msgId, emoji }), [])
  const updateStatus = useCallback((patch)      => socket.emit('updateStatus', patch), [])
  const startGame    = useCallback((type)       => socket.emit('startGame',   { type }), [])
  const gameAction   = useCallback((payload)    => socket.emit('gameAction',   payload), [])
  const endGame      = useCallback(()           => socket.emit('endGame'), [])
  const setVideo     = useCallback((url)        => socket.emit('setVideo',    { url }), [])
  const stopVideo    = useCallback(()           => socket.emit('stopVideo'), [])
  const playVideo    = useCallback((t)          => socket.emit('playVideo',   { currentTime: t }), [])
  const pauseVideo   = useCallback((t)          => socket.emit('pauseVideo',  { currentTime: t }), [])
  const seekVideo    = useCallback((t)          => socket.emit('seekVideo',   { currentTime: t }), [])

  const isHost = roomData?.hostId === socket.id

  return {
    connected, roomData, members, messages, game, watchVideo,
    error, isHost, selfSocketId: socket.id,
    sendMessage, reactMessage, updateStatus,
    startGame, gameAction, endGame,
    setVideo, stopVideo, playVideo, pauseVideo, seekVideo,
  }
}
