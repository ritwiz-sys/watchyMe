import { useEffect, useState, useRef, useCallback } from 'react'
import {
  Room,
  RoomEvent,
  Track,
  ConnectionState,
  ParticipantEvent,
} from 'livekit-client'

const LK_URL = import.meta.env.VITE_LIVEKIT_URL
const SERVER = import.meta.env.VITE_SERVER_URL || 'http://localhost:4000'
/**
 * useLiveKit({ roomCode, identity, displayName, enabled })
 *
 * Connects to a LiveKit room for real audio/video.
 * identity should be the socket.id so participants can be matched to
 * the socket.io members list in useRoom.
 *
 * Returns:
 *  - connectionState  : 'disconnected' | 'connecting' | 'connected' | 'reconnecting'
 *  - localParticipant : LiveKit LocalParticipant (or null)
 *  - remoteParticipants: LiveKit RemoteParticipant[]
 *  - micEnabled       : bool
 *  - camEnabled       : bool
 *  - screenSharing    : bool
 *  - toggleMic()      : async fn
 *  - toggleCam()      : async fn
 *  - toggleScreen()   : async fn
 */
export function useLiveKit({ roomCode, identity, displayName, enabled = true }) {
  const roomRef = useRef(null)

  const [connectionState,    setConnectionState]    = useState('disconnected')
  const [localParticipant,   setLocalParticipant]   = useState(null)
  const [remoteParticipants, setRemoteParticipants] = useState([])
  const [micEnabled,         setMicEnabled]         = useState(false)
  const [camEnabled,         setCamEnabled]         = useState(false)
  const [screenSharing,      setScreenSharing]      = useState(false)

  /* refresh remote participant list */
  const refresh = useCallback(() => {
    const r = roomRef.current
    if (!r) return
    setRemoteParticipants([...r.remoteParticipants.values()])
    setLocalParticipant(r.localParticipant ?? null)
  }, [])

  useEffect(() => {
    if (!enabled || !roomCode || !identity || !LK_URL) return

    const lkRoom = new Room({
      adaptiveStream: true,
      dynacast:       true,
      audioCaptureDefaults: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl:  true,
      },
      videoCaptureDefaults: {
        resolution: { width: 1280, height: 720, frameRate: 24 },
        facingMode: 'user',
      },
    })
    roomRef.current = lkRoom

    lkRoom
      .on(RoomEvent.ConnectionStateChanged, (state) => {
        setConnectionState(state)
        if (state === ConnectionState.Connected) refresh()
      })
      .on(RoomEvent.ParticipantConnected,    refresh)
      .on(RoomEvent.ParticipantDisconnected, refresh)
      .on(RoomEvent.TrackSubscribed,         refresh)
      .on(RoomEvent.TrackUnsubscribed,       refresh)
      .on(RoomEvent.LocalTrackPublished,     refresh)
      .on(RoomEvent.LocalTrackUnpublished,   refresh)

    const connect = async () => {
      try {
        setConnectionState('connecting')
        const resp = await fetch(
          `${SERVER}/api/livekit/token` +
          `?room=${encodeURIComponent(roomCode)}` +
          `&identity=${encodeURIComponent(identity)}` +
          `&name=${encodeURIComponent(displayName || identity)}`
        )
        const { token, error } = await resp.json()
        if (error) {
          console.warn('[LiveKit] token error:', error)
          setConnectionState('disconnected')
          return
        }
        await lkRoom.connect(LK_URL, token)
      } catch (e) {
        console.warn('[LiveKit] connect failed:', e.message)
        setConnectionState('disconnected')
      }
    }
    connect()

    return () => {
      lkRoom.removeAllListeners()
      lkRoom.disconnect()
      roomRef.current = null
      setConnectionState('disconnected')
      setLocalParticipant(null)
      setRemoteParticipants([])
      setMicEnabled(false)
      setCamEnabled(false)
      setScreenSharing(false)
    }
  }, [roomCode, identity, displayName, enabled])

  /* ── track toggles ─────────────────────────────────────────── */
  const toggleMic = useCallback(async () => {
    const r = roomRef.current
    if (!r) return
    const next = !micEnabled
    try {
      await r.localParticipant.setMicrophoneEnabled(next)
      setMicEnabled(next)
    } catch (e) {
      console.warn('[LiveKit] toggleMic failed:', e.message)
    }
  }, [micEnabled])

  const toggleCam = useCallback(async () => {
    const r = roomRef.current
    if (!r) return
    const next = !camEnabled
    try {
      await r.localParticipant.setCameraEnabled(next)
      setCamEnabled(next)
    } catch (e) {
      console.warn('[LiveKit] toggleCam failed:', e.message)
    }
  }, [camEnabled])

  const toggleScreen = useCallback(async () => {
    const r = roomRef.current
    if (!r) return
    const next = !screenSharing
    try {
      await r.localParticipant.setScreenShareEnabled(next)
      setScreenSharing(next)
    } catch (e) {
      console.warn('[LiveKit] toggleScreen failed:', e.message)
    }
  }, [screenSharing])

  return {
    connectionState,
    localParticipant,
    remoteParticipants,
    micEnabled,
    camEnabled,
    screenSharing,
    toggleMic,
    toggleCam,
    toggleScreen,
  }
}
