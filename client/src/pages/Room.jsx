import { useState, useRef, useEffect, useCallback } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useUser } from '@clerk/clerk-react'
import {
  Mic, MicOff, Video, VideoOff, MonitorUp, Hand, Smile,
  PhoneOff, Users, MessageSquare, Tv, Link, Send, Settings,
  MoreHorizontal, Loader, X,
} from 'lucide-react'
import { useRoom } from '../hooks/useRoom'
import { socket } from '../lib/socket'
import { useLiveKit } from '../hooks/useLiveKit'
import { useLocalMedia } from '../hooks/useLocalMedia'
import { Track, ParticipantEvent } from 'livekit-client'

const AV = (url, s = 40) =>
  url || `https://ui-avatars.com/api/?size=${s}&background=7c3aed&color=fff&name=U`

const TILE_BG = [
  'linear-gradient(145deg,#1a1040 0%,#0f0a2e 50%,#1a0e3d 100%)',
  'linear-gradient(145deg,#0a1628 0%,#0d1f3c 50%,#0f172a 100%)',
  'linear-gradient(145deg,#120d2e 0%,#1c1040 50%,#0d0a24 100%)',
  'linear-gradient(145deg,#0e1a22 0%,#0d2030 50%,#0a1520 100%)',
  'linear-gradient(145deg,#1a0e38 0%,#150c30 50%,#0c0820 100%)',
  'linear-gradient(145deg,#0d1420 0%,#111c2c 50%,#0a1018 100%)',
]

/* ════════════════════════════════════════════
   SYNCED WATCH-PARTY PLAYERS
   Both components apply remote play/pause/seek state
   from the server while guarding against feedback loops
   (i.e. our own local action re-triggering itself).
════════════════════════════════════════════ */

// loads the YouTube IFrame JS API once, shared across mounts
let ytApiPromise = null
function loadYouTubeApi() {
  if (window.YT?.Player) return Promise.resolve(window.YT)
  if (ytApiPromise) return ytApiPromise
  ytApiPromise = new Promise(resolve => {
    const prev = window.onYouTubeIframeAPIReady
    window.onYouTubeIframeAPIReady = () => { prev?.(); resolve(window.YT) }
    const tag = document.createElement('script')
    tag.src = 'https://www.youtube.com/iframe_api'
    document.head.appendChild(tag)
  })
  return ytApiPromise
}

const DRIFT_THRESHOLD = 1.5 // seconds — only force-seek beyond this drift

function SyncedYouTubePlayer({ videoId, watchVideo, onPlay, onPause, onSeek }) {
  const mountRef   = useRef(null)
  const playerRef  = useRef(null)
  const ignoreRef  = useRef(false) // true while applying a remote update
  const readyRef   = useRef(false)

  // mount the player once
  useEffect(() => {
    let destroyed = false
    loadYouTubeApi().then(YT => {
      if (destroyed || !mountRef.current) return
      playerRef.current = new YT.Player(mountRef.current, {
        videoId,
        width: '100%', height: '100%',
        playerVars: { autoplay: 1, rel: 0, modestbranding: 1, playsinline: 1 },
        events: {
          onReady: () => {
            readyRef.current = true
            const wv = watchVideo
            if (wv) {
              ignoreRef.current = true
              playerRef.current.seekTo(wv.currentTime || 0, true)
              if (wv.playing) playerRef.current.playVideo()
              else playerRef.current.pauseVideo()
              setTimeout(() => { ignoreRef.current = false }, 400)
            }
          },
          onStateChange: (e) => {
            if (ignoreRef.current) return
            const YTState = window.YT.PlayerState
            if (e.data === YTState.PLAYING)  onPlay?.(playerRef.current.getCurrentTime())
            if (e.data === YTState.PAUSED)   onPause?.(playerRef.current.getCurrentTime())
          },
        },
      })
    })
    return () => {
      destroyed = true
      try { playerRef.current?.destroy() } catch {}
      playerRef.current = null
    }
  }, [videoId])

  // apply remote state changes (play/pause/seek/drift-correction)
  useEffect(() => {
    if (!readyRef.current || !playerRef.current || !watchVideo) return
    const p = playerRef.current
    ignoreRef.current = true
    try {
      const localTime = p.getCurrentTime?.() ?? 0
      if (Math.abs(localTime - watchVideo.currentTime) > DRIFT_THRESHOLD) {
        p.seekTo(watchVideo.currentTime, true)
      }
      const state = p.getPlayerState?.()
      const YTState = window.YT?.PlayerState
      if (watchVideo.playing && state !== YTState?.PLAYING) p.playVideo()
      if (!watchVideo.playing && state === YTState?.PLAYING) p.pauseVideo()
    } catch {}
    const t = setTimeout(() => { ignoreRef.current = false }, 400)
    return () => clearTimeout(t)
  }, [watchVideo?.playing, watchVideo?.currentTime, watchVideo?.updatedAt])

  return <div ref={mountRef} style={{ width:'100%', height:'100%' }} />
}

function SyncedDirectVideo({ url, watchVideo, onPlay, onPause, onSeek }) {
  const videoRef  = useRef(null)
  const ignoreRef = useRef(false)

  // apply remote state
  useEffect(() => {
    const v = videoRef.current
    if (!v || !watchVideo) return
    ignoreRef.current = true
    if (Math.abs(v.currentTime - watchVideo.currentTime) > DRIFT_THRESHOLD) {
      v.currentTime = watchVideo.currentTime
    }
    if (watchVideo.playing && v.paused)  v.play().catch(() => {})
    if (!watchVideo.playing && !v.paused) v.pause()
    const t = setTimeout(() => { ignoreRef.current = false }, 400)
    return () => clearTimeout(t)
  }, [watchVideo?.playing, watchVideo?.currentTime, watchVideo?.updatedAt])

  return (
    <video
      ref={videoRef}
      src={url}
      controls
      autoPlay
      style={{ width:'100%', height:'100%', objectFit:'contain', position:'relative', zIndex:1 }}
      onPlay={() => { if (!ignoreRef.current) onPlay?.(videoRef.current.currentTime) }}
      onPause={() => { if (!ignoreRef.current) onPause?.(videoRef.current.currentTime) }}
      onSeeked={() => { if (!ignoreRef.current) onSeek?.(videoRef.current.currentTime) }}
    />
  )
}

/* ════════════════════════════════════════════
   LIVEKIT TRACK RENDERERS
════════════════════════════════════════════ */
function VideoTrackRenderer({ participant, source, muted = false, style = {} }) {
  const videoRef = useRef(null)
  useEffect(() => {
    if (!participant) return
    const attachTrack = () => {
      const pub   = participant.getTrackPublication(source)
      const track = pub?.track
      if (track && videoRef.current) track.attach(videoRef.current)
    }
    const detachTrack = () => {
      const pub   = participant.getTrackPublication(source)
      const track = pub?.track
      if (track && videoRef.current) { try { track.detach(videoRef.current) } catch (_) {} }
    }
    attachTrack()
    participant.on(ParticipantEvent.TrackPublished,    attachTrack)
    participant.on(ParticipantEvent.TrackUnpublished,  detachTrack)
    participant.on(ParticipantEvent.TrackSubscribed,   attachTrack)
    participant.on(ParticipantEvent.TrackUnsubscribed, detachTrack)
    return () => {
      detachTrack()
      participant.off(ParticipantEvent.TrackPublished,    attachTrack)
      participant.off(ParticipantEvent.TrackUnpublished,  detachTrack)
      participant.off(ParticipantEvent.TrackSubscribed,   attachTrack)
      participant.off(ParticipantEvent.TrackUnsubscribed, detachTrack)
    }
  }, [participant, source])
  return (
    <video ref={videoRef} autoPlay playsInline muted={muted}
      style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block', ...style }} />
  )
}

function AudioTrackRenderer({ participant }) {
  const audioRef = useRef(null)
  useEffect(() => {
    if (!participant) return
    const attachAudio = () => {
      const pub   = participant.getTrackPublication(Track.Source.Microphone)
      const track = pub?.track
      if (track && audioRef.current) track.attach(audioRef.current)
    }
    attachAudio()
    participant.on(ParticipantEvent.TrackSubscribed, attachAudio)
    return () => {
      participant.off(ParticipantEvent.TrackSubscribed, attachAudio)
      const pub   = participant.getTrackPublication(Track.Source.Microphone)
      const track = pub?.track
      if (track && audioRef.current) { try { track.detach(audioRef.current) } catch (_) {} }
    }
  }, [participant])
  return <audio ref={audioRef} autoPlay style={{ display: 'none' }} />
}

/* ── Remote screen-share track (LiveKit) ── */
function ScreenShareRenderer({ participant }) {
  const videoRef = useRef(null)
  useEffect(() => {
    if (!participant) return
    const attach = () => {
      const pub   = participant.getTrackPublication(Track.Source.ScreenShare)
      const track = pub?.track
      if (track && videoRef.current) track.attach(videoRef.current)
    }
    const detach = () => {
      const pub   = participant.getTrackPublication(Track.Source.ScreenShare)
      const track = pub?.track
      if (track && videoRef.current) { try { track.detach(videoRef.current) } catch (_) {} }
    }
    attach()
    participant.on(ParticipantEvent.TrackPublished,    attach)
    participant.on(ParticipantEvent.TrackUnpublished,  detach)
    participant.on(ParticipantEvent.TrackSubscribed,   attach)
    participant.on(ParticipantEvent.TrackUnsubscribed, detach)
    return () => {
      detach()
      participant.off(ParticipantEvent.TrackPublished,    attach)
      participant.off(ParticipantEvent.TrackUnpublished,  detach)
      participant.off(ParticipantEvent.TrackSubscribed,   attach)
      participant.off(ParticipantEvent.TrackUnsubscribed, detach)
    }
  }, [participant])
  return (
    <video ref={videoRef} autoPlay playsInline
      style={{ width:'100%', height:'100%', objectFit:'contain', background:'#000', display:'block' }} />
  )
}

/* ── Local screen-share via native getDisplayMedia ── */
function LocalScreenRenderer({ stream }) {
  const videoRef = useRef(null)
  useEffect(() => {
    if (!videoRef.current) return
    videoRef.current.srcObject = stream || null
  }, [stream])
  return (
    <video ref={videoRef} autoPlay playsInline muted
      style={{ width:'100%', height:'100%', objectFit:'contain', background:'#000', display:'block' }} />
  )
}

/* ════════════════════════════════════════════
   PARTICIPANT TILE  (voice / cam grid card)
════════════════════════════════════════════ */
function Tile({ member, isSelf, big, lkParticipant, localStream }) {
  const { name = 'User', avatar, muted, camOff, speaking } = member
  const bg           = TILE_BG[Math.abs((name).charCodeAt(0)) % TILE_BG.length]
  const sz           = big ? 80 : 60
  const localVideoRef = useRef(null)

  // attach local getUserMedia stream to video element
  useEffect(() => {
    if (localStream && localVideoRef.current) {
      localVideoRef.current.srcObject = localStream
    }
  }, [localStream])

  const hasLKVideo    = !!(lkParticipant && !camOff)
  const hasLocalVideo = !!(localStream   && !camOff)
  const hasVideo      = hasLKVideo || hasLocalVideo

  return (
    <div style={{
      borderRadius: 20, overflow: 'hidden', position: 'relative',
      aspectRatio: '16/9', flex: 1, minWidth: 0, background: bg,
      border:    speaking ? '2px solid rgba(34,197,94,.7)' : '1px solid rgba(255,255,255,.07)',
      boxShadow: speaking
        ? '0 0 0 3px rgba(34,197,94,.25), 0 0 24px rgba(34,197,94,.55), 0 0 60px rgba(34,197,94,.2), 0 8px 32px rgba(0,0,0,.6)'
        : '0 8px 32px rgba(0,0,0,.55), 0 1px 0 rgba(255,255,255,.05) inset',
      animation:  speaking ? 'speakGlow 1.2s ease-in-out infinite' : 'none',
      transition: 'border .18s, box-shadow .18s',
    }}>
      {/* top glare line */}
      <div style={{ position:'absolute', top:0, left:0, right:0, height:1, background:'linear-gradient(90deg, transparent, rgba(255,255,255,.08), transparent)', zIndex:10, pointerEvents:'none' }} />
      {/* LiveKit video overlay */}
      {hasLKVideo && (
        <div style={{ position:'absolute', inset:0, zIndex:1 }}>
          <VideoTrackRenderer participant={lkParticipant} source={Track.Source.Camera} muted={isSelf} />
        </div>
      )}
      {/* Direct getUserMedia video (self-tile fallback) */}
      {!hasLKVideo && hasLocalVideo && (
        <video ref={localVideoRef} autoPlay muted playsInline
          style={{ position:'absolute', inset:0, width:'100%', height:'100%', objectFit:'cover', zIndex:1 }} />
      )}
      {/* hidden audio renderer for remote participants */}
      {!isSelf && lkParticipant && <AudioTrackRenderer participant={lkParticipant} />}
      {/* avatar (shown when no video) */}
      <div style={{ position:'absolute', inset:0, display:'flex', alignItems:'center', justifyContent:'center', opacity: hasVideo ? 0 : 1, transition:'opacity .3s', zIndex:0 }}>
        <div style={{ position:'relative' }}>
          {speaking && <>
            <div style={{ position:'absolute', inset:-15, borderRadius:'50%', border:'2px solid rgba(34,197,94,.2)', animation:'sPulse 1.5s ease-in-out infinite' }} />
            <div style={{ position:'absolute', inset:-7,  borderRadius:'50%', border:'1.5px solid rgba(34,197,94,.4)', animation:'sPulse 1.5s ease-in-out .35s infinite' }} />
          </>}
          <img src={AV(avatar, sz)} style={{ width:sz, height:sz, borderRadius:'50%', display:'block', border: speaking ? '3px solid #22c55e' : '3px solid rgba(255,255,255,.15)' }} />
          {speaking && (
            <div style={{ position:'absolute', bottom:-10, left:'50%', transform:'translateX(-50%)', display:'flex', gap:2, alignItems:'flex-end', height:12 }}>
              {[4,7,5,9,4,6,3].map((h,i) => (
                <div key={i} style={{ width:2, height:h, borderRadius:2, background:'#22c55e', animation:`bPulse 1.1s ease-in-out ${i*70}ms infinite` }} />
              ))}
            </div>
          )}
        </div>
      </div>
      {/* name bar */}
      <div style={{ position:'absolute', bottom:0, left:0, right:0, padding:'36px 12px 11px', background:'linear-gradient(to top,rgba(0,0,0,.92) 0%,rgba(0,0,0,.6) 50%,transparent 100%)' }}>
        <div style={{ display:'flex', alignItems:'center', gap:6 }}>
          {speaking && (
            <div style={{ width:7, height:7, borderRadius:'50%', background:'#22c55e', boxShadow:'0 0 6px #22c55e', flexShrink:0, animation:'wPulse 1.2s ease-in-out infinite' }} />
          )}
          <span style={{ fontSize:12, fontWeight:700, color: speaking ? '#f0fdf4' : 'rgba(255,255,255,.92)', flex:1, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', letterSpacing:'-.01em' }}>
            {isSelf ? 'You' : name}
          </span>
          <div style={{ display:'flex', gap:4, alignItems:'center' }}>
            {muted   && <div style={{ width:18, height:18, borderRadius:6, background:'rgba(239,68,68,.18)', display:'flex', alignItems:'center', justifyContent:'center' }}><MicOff   size={10} color="#f87171" /></div>}
            {camOff  && <div style={{ width:18, height:18, borderRadius:6, background:'rgba(245,158,11,.15)', display:'flex', alignItems:'center', justifyContent:'center' }}><VideoOff size={10} color="#fbbf24" /></div>}
          </div>
        </div>
      </div>
    </div>
  )
}

/* ════════════════════════════════════════════
   MEMBER STRIP  (compact bar above games)
════════════════════════════════════════════ */
function Strip({ members, scores }) {
  return (
    <div style={{ display:'flex', gap:10, padding:'10px 16px', background:'rgba(0,0,0,.35)', borderBottom:'1px solid rgba(255,255,255,.06)', overflowX:'auto', flexShrink:0 }}>
      {members.map(m => (
        <div key={m.socketId} style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:3, flexShrink:0 }}>
          <div style={{ position:'relative' }}>
            <img src={AV(m.avatar,32)} style={{ width:32, height:32, borderRadius:'50%', border: m.speaking ? '2px solid #22c55e':'2px solid rgba(255,255,255,.1)', display:'block' }} />
            {m.muted && <div style={{ position:'absolute', bottom:-2, right:-2, width:11, height:11, borderRadius:'50%', background:'#09091c', display:'flex', alignItems:'center', justifyContent:'center' }}><MicOff size={6} color="#ef4444" /></div>}
          </div>
          <div style={{ fontSize:9, color:'#d1d5db', fontWeight:600, maxWidth:44, textAlign:'center', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{m.name.split(' ')[0]}</div>
          {scores && <div style={{ fontSize:10, color:'#a78bfa', fontWeight:800 }}>{scores[m.socketId]||0}p</div>}
        </div>
      ))}
    </div>
  )
}

/* ════════════════════════════════════════════
   A-FRAME CINEMA DISPLAY WRAPPER
════════════════════════════════════════════ */
function AFrameDisplay({ children, pulse }) {
  return (
    <div style={{
      flex: 1, display: 'flex', flexDirection: 'column',
      alignItems: 'stretch', padding: '14px 28px 0',
      minHeight: 0, position: 'relative',
    }}>
      {/* Ambient back-light glow */}
      <div style={{
        position: 'absolute', top: 0, left: '8%', right: '8%', height: 90,
        background: 'radial-gradient(ellipse, rgba(124,58,237,.22) 0%, transparent 70%)',
        filter: 'blur(22px)', pointerEvents: 'none', zIndex: 0,
      }} />

      {/* Monitor body */}
      <div style={{
        position: 'relative', zIndex: 1,
        flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0,
        borderRadius: 20,
        background: 'linear-gradient(160deg, #1a1a2e 0%, #0d0d1c 100%)',
        border: `1.5px solid ${pulse ? 'rgba(124,58,237,.7)' : 'rgba(255,255,255,.1)'}`,
        padding: '10px 10px 38px',
        boxShadow: pulse
          ? '0 0 0 1px rgba(0,0,0,.8), 0 0 40px rgba(124,58,237,.45), 0 30px 90px rgba(0,0,0,.65), inset 0 1px 0 rgba(255,255,255,.07)'
          : '0 0 0 1px rgba(0,0,0,.8), 0 30px 90px rgba(0,0,0,.65), 0 0 60px rgba(124,58,237,.07), inset 0 1px 0 rgba(255,255,255,.07)',
        transition: 'border .4s, box-shadow .4s',
      }}>
        {/* Camera dot */}
        <div style={{
          position: 'absolute', top: 7, left: '50%', transform: 'translateX(-50%)',
          width: 5, height: 5, borderRadius: '50%',
          background: pulse ? 'rgba(34,197,94,.7)' : 'rgba(124,58,237,.45)',
          boxShadow: pulse ? '0 0 8px rgba(34,197,94,.8)' : '0 0 5px rgba(124,58,237,.5)',
          transition: 'background .4s, box-shadow .4s',
        }} />

        {/* Top accent bar */}
        <div style={{
          position: 'absolute', top: 0, left: '50%', transform: 'translateX(-50%)',
          width: 64, height: 3, borderRadius: '0 0 8px 8px',
          background: 'linear-gradient(to right, transparent, rgba(124,58,237,.75), transparent)',
        }} />

        {/* Screen surface */}
        <div style={{
          flex: 1, borderRadius: 11, overflow: 'hidden',
          background: '#020208', minHeight: 0, position: 'relative',
          boxShadow: 'inset 0 0 0 1px rgba(255,255,255,.04), inset 0 3px 20px rgba(0,0,0,.9)',
        }}>
          {/* Scanlines */}
          <div style={{
            position: 'absolute', inset: 0, zIndex: 20, pointerEvents: 'none',
            background: 'repeating-linear-gradient(0deg, transparent, transparent 3px, rgba(0,0,0,.022) 3px, rgba(0,0,0,.022) 6px)',
            mixBlendMode: 'multiply',
          }} />
          {/* Vignette */}
          <div style={{
            position: 'absolute', inset: 0, zIndex: 19, pointerEvents: 'none',
            background: 'radial-gradient(ellipse at center, transparent 55%, rgba(0,0,0,.28) 100%)',
          }} />
          {/* Glare streak */}
          <div style={{
            position: 'absolute', top: 0, left: 0, right: 0, height: '32%',
            zIndex: 18, pointerEvents: 'none',
            background: 'linear-gradient(to bottom, rgba(255,255,255,.022) 0%, transparent 100%)',
          }} />
          {children}
        </div>

        {/* Bottom bezel label */}
        <div style={{
          position: 'absolute', bottom: 14, left: 0, right: 0,
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
        }}>
          <div style={{ width: 22, height: 1.5, borderRadius: 1, background: 'rgba(255,255,255,.06)' }} />
          <span style={{ fontSize: 7, color: 'rgba(255,255,255,.14)', letterSpacing: '.3em', fontWeight: 700 }}>
            WATCHYME · DISPLAY
          </span>
          <div style={{ width: 22, height: 1.5, borderRadius: 1, background: 'rgba(255,255,255,.06)' }} />
        </div>

        {/* Corner accent marks */}
        {[
          { top: 7, left: 7 },
          { top: 7, right: 7 },
          { bottom: 30, left: 7 },
          { bottom: 30, right: 7 },
        ].map((pos, i) => (
          <div key={i} style={{
            position: 'absolute', ...pos, width: 12, height: 12,
            borderTop:    pos.top    !== undefined ? '1.5px solid rgba(124,58,237,.3)' : 'none',
            borderBottom: pos.bottom !== undefined ? '1.5px solid rgba(124,58,237,.3)' : 'none',
            borderLeft:   pos.left   !== undefined ? '1.5px solid rgba(124,58,237,.3)' : 'none',
            borderRight:  pos.right  !== undefined ? '1.5px solid rgba(124,58,237,.3)' : 'none',
          }} />
        ))}
      </div>

      {/* ── A-frame stand ── */}
      <div style={{ height: 58, position: 'relative', flexShrink: 0 }}>
        {/* Neck trapezoid */}
        <div style={{
          position: 'absolute', top: 0, left: '50%', transform: 'translateX(-50%)',
          width: 42, height: 20,
          background: 'linear-gradient(to bottom, #171728, #0f0f1e)',
          clipPath: 'polygon(18% 0%, 82% 0%, 100% 100%, 0% 100%)',
        }} />
        {/* Left leg */}
        <div style={{
          position: 'absolute', top: 17, left: '50%', marginLeft: -20,
          width: 7, height: 36, borderRadius: '2px 2px 4px 4px',
          background: 'linear-gradient(to right, #1c1c30, #10101e)',
          transform: 'rotate(-27deg)', transformOrigin: 'top center',
          boxShadow: 'inset 1px 0 0 rgba(255,255,255,.07), 0 2px 8px rgba(0,0,0,.5)',
        }} />
        {/* Right leg */}
        <div style={{
          position: 'absolute', top: 17, right: '50%', marginRight: -20,
          width: 7, height: 36, borderRadius: '2px 2px 4px 4px',
          background: 'linear-gradient(to left, #1c1c30, #10101e)',
          transform: 'rotate(27deg)', transformOrigin: 'top center',
          boxShadow: 'inset -1px 0 0 rgba(255,255,255,.07), 0 2px 8px rgba(0,0,0,.5)',
        }} />
        {/* A crossbar */}
        <div style={{
          position: 'absolute', top: 33, left: '50%', transform: 'translateX(-50%)',
          width: 72, height: 4, borderRadius: 2,
          background: 'linear-gradient(to right, transparent, rgba(255,255,255,.08), transparent)',
          boxShadow: '0 1px 4px rgba(0,0,0,.6)',
        }} />
        {/* Left foot */}
        <div style={{
          position: 'absolute', bottom: 0, left: '50%', marginLeft: -64,
          width: 34, height: 3, borderRadius: 2,
          background: 'rgba(255,255,255,.05)',
        }} />
        {/* Right foot */}
        <div style={{
          position: 'absolute', bottom: 0, right: '50%', marginRight: -64,
          width: 34, height: 3, borderRadius: 2,
          background: 'rgba(255,255,255,.05)',
        }} />
        {/* Floor glow */}
        <div style={{
          position: 'absolute', bottom: -3, left: '50%', transform: 'translateX(-50%)',
          width: 180, height: 12,
          background: 'radial-gradient(ellipse, rgba(124,58,237,.14) 0%, transparent 70%)',
          filter: 'blur(6px)',
        }} />
      </div>
    </div>
  )
}

/* ════════════════════════════════════════════
   WATCH VIEW
════════════════════════════════════════════ */
function WatchView({ code }) {
  const [inputUrl, setInputUrl] = useState('')
  const [url,      setUrl]      = useState('')
  const [copied,   setCopied]   = useState(false)
  const link = window.location.href
  const copy = () => { navigator.clipboard.writeText(link); setCopied(true); setTimeout(()=>setCopied(false),2500) }
  const getEmbed = raw => {
    const yt = raw.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([a-zA-Z0-9_-]{11})/)
    return yt ? `https://www.youtube.com/embed/${yt[1]}?autoplay=1&rel=0` : null
  }
  const embed  = url ? getEmbed(url) : null
  const isDirect = url && !embed && (url.endsWith('.mp4') || url.endsWith('.webm'))

  return (
    <div style={{ flex:1, display:'flex', flexDirection:'column', overflow:'hidden', padding:16, gap:14 }}>
      {/* URL bar */}
      <div style={{ display:'flex', gap:8 }}>
        <div style={{ flex:1, display:'flex', alignItems:'center', gap:8, background:'rgba(255,255,255,.06)', border:'1px solid rgba(255,255,255,.12)', borderRadius:12, padding:'9px 14px' }}>
          <span style={{ fontSize:16 }}>📺</span>
          <input value={inputUrl} onChange={e=>setInputUrl(e.target.value)}
            onKeyDown={e=>e.key==='Enter' && setUrl(inputUrl.trim())}
            placeholder="Paste YouTube or video URL and press Enter…"
            style={{ flex:1, background:'none', border:'none', outline:'none', color:'white', fontSize:13, fontFamily:'Outfit,sans-serif' }} />
        </div>
        <button onClick={()=>setUrl(inputUrl.trim())}
          style={{ padding:'9px 18px', borderRadius:12, border:'none', background:'linear-gradient(135deg,#7c3aed,#6d28d9)', color:'white', fontWeight:700, fontSize:13, cursor:'pointer', fontFamily:'Outfit,sans-serif' }}>
          ▶ Play
        </button>
      </div>

      {embed ? (
        <div style={{ flex:1, borderRadius:18, overflow:'hidden', background:'#000', minHeight:180 }}>
          <iframe src={embed} style={{ width:'100%', height:'100%', border:'none' }} allow="autoplay; fullscreen" allowFullScreen />
        </div>
      ) : isDirect ? (
        <div style={{ flex:1, borderRadius:18, overflow:'hidden', background:'#000', minHeight:180 }}>
          <video src={url} controls autoPlay style={{ width:'100%', height:'100%', objectFit:'contain' }} />
        </div>
      ) : (
        <div style={{ flex:1, display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', gap:20, borderRadius:18, border:'1px dashed rgba(255,255,255,.1)', background:'rgba(255,255,255,.02)' }}>
          <div style={{ textAlign:'center' }}>
            <div style={{ fontSize:52, marginBottom:12 }}>🎬</div>
            <div style={{ fontSize:18, fontWeight:800, color:'white', marginBottom:6 }}>Watch Together</div>
            <div style={{ fontSize:13, color:'#6b7280', maxWidth:320, lineHeight:1.7 }}>Paste a YouTube link above — everyone in the room watches in sync.</div>
          </div>
          <div style={{ padding:'18px 24px', borderRadius:18, border:'1px solid rgba(124,58,237,.2)', background:'rgba(124,58,237,.06)', maxWidth:380, width:'100%', display:'flex', flexDirection:'column', gap:10 }}>
            <div style={{ fontSize:11, color:'#9ca3af', fontWeight:700, textTransform:'uppercase', letterSpacing:'.07em' }}>Invite Friends</div>
            <div style={{ display:'flex', background:'rgba(255,255,255,.04)', border:'1px solid rgba(255,255,255,.1)', borderRadius:10, overflow:'hidden' }}>
              <div style={{ flex:1, padding:'8px 12px', fontSize:12, color:'#d1d5db', fontFamily:'monospace', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{link}</div>
              <button onClick={copy} style={{ padding:'8px 14px', border:'none', borderLeft:'1px solid rgba(255,255,255,.08)', background: copied?'rgba(34,197,94,.15)':'rgba(124,58,237,.15)', color: copied?'#4ade80':'#a78bfa', fontSize:11, fontWeight:700, cursor:'pointer', whiteSpace:'nowrap' }}>
                {copied ? '✓ Copied' : '📋 Copy'}
              </button>
            </div>
            <div style={{ fontSize:11, color:'#6b7280', textAlign:'center' }}>Code: <strong style={{ color:'#a78bfa', letterSpacing:'.1em' }}>{code}</strong></div>
          </div>
        </div>
      )}
    </div>
  )
}

/* ════════════════════════════════════════════
   DRAW & GUESS VIEW
════════════════════════════════════════════ */
function DrawView({ game, members, isHost, onAction, onEnd, selfId }) {
  const canvasRef  = useRef(null)
  const lastPos    = useRef(null)
  const [drawing,  setDrawing]  = useState(false)
  const [color,    setColor]    = useState('#1a1a2e')
  const [brush,    setBrush]    = useState(5)
  const [guess,    setGuess]    = useState('')

  const isDrawer = game?.drawer === selfId
  const word     = game?.word || ''
  const masked   = word.split('').map(c => c===' ' ? '   ' : '_ ').join('')
  const guesses  = game?.guesses || []
  const tLeft    = game?.timeLeft ?? 60
  const phase    = game?.phase || 'drawing'

  /* relay draw events from server onto canvas */
  useEffect(() => {
    const onDraw = ({ from, to, color:c, brush:b }) => {
      const cv = canvasRef.current; if (!cv) return
      const ctx = cv.getContext('2d')
      ctx.strokeStyle=c; ctx.lineWidth=b; ctx.lineCap='round'; ctx.lineJoin='round'
      ctx.beginPath(); ctx.moveTo(from.x,from.y); ctx.lineTo(to.x,to.y); ctx.stroke()
    }
    const onClear = () => { const cv=canvasRef.current; cv && cv.getContext('2d').clearRect(0,0,cv.width,cv.height) }
    socket.on('drawEvent',   onDraw)
    socket.on('clearCanvas', onClear)
    return () => { socket.off('drawEvent', onDraw); socket.off('clearCanvas', onClear) }
  }, [])

  const getXY = (e, cv) => {
    const r=cv.getBoundingClientRect()
    const cx = e.touches ? e.touches[0].clientX : e.clientX
    const cy = e.touches ? e.touches[0].clientY : e.clientY
    return { x:(cx-r.left)*(cv.width/r.width), y:(cy-r.top)*(cv.height/r.height) }
  }

  const drawLine = useCallback((ctx, a, b, c, w) => {
    ctx.strokeStyle=c; ctx.lineWidth=w; ctx.lineCap='round'; ctx.lineJoin='round'
    ctx.beginPath(); ctx.moveTo(a.x,a.y); ctx.lineTo(b.x,b.y); ctx.stroke()
  }, [])

  const onDown = e => {
    if (!isDrawer) return
    setDrawing(true); lastPos.current = getXY(e, canvasRef.current)
  }
  const onMove = e => {
    if (!isDrawer || !drawing) return
    e.preventDefault()
    const pos = getXY(e, canvasRef.current)
    drawLine(canvasRef.current.getContext('2d'), lastPos.current, pos, color, brush)
    socket.emit('drawEvent', { from:lastPos.current, to:pos, color, brush })
    lastPos.current = pos
  }
  const onUp = () => setDrawing(false)
  const clearAll = () => {
    canvasRef.current?.getContext('2d').clearRect(0,0,canvasRef.current.width,canvasRef.current.height)
    socket.emit('clearCanvas')
  }
  const sendGuess = () => {
    if (!guess.trim()) return
    onAction({ guess: guess.trim() })
    setGuess('')
  }

  const PALETTE = ['#1a1a2e','#ffffff','#ef4444','#f97316','#eab308','#22c55e','#06b6d4','#3b82f6','#8b5cf6','#ec4899','#6b7280','#92400e']

  /* ── Reveal phase ── */
  if (phase === 'reveal') return (
    <div style={{ flex:1, display:'flex', flexDirection:'column', overflow:'hidden' }}>
      <Strip members={members} scores={game.scores} />
      <div style={{ flex:1, display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', gap:16 }}>
        <div style={{ fontSize:44 }}>🎨</div>
        <div style={{ fontSize:22, fontWeight:900, color:'white' }}>The word was:</div>
        <div style={{ fontSize:36, fontWeight:900, color:'#a78bfa', letterSpacing:'.06em', padding:'12px 32px', borderRadius:18, background:'rgba(124,58,237,.12)', border:'1px solid rgba(124,58,237,.3)' }}>{word}</div>
        <div style={{ fontSize:13, color:'#6b7280' }}>Next round starting…</div>
      </div>
    </div>
  )

  return (
    <div style={{ flex:1, display:'flex', flexDirection:'column', overflow:'hidden' }}>
      <Strip members={members} scores={game.scores} />
      <div style={{ flex:1, display:'flex', overflow:'hidden', minHeight:0 }}>

        {/* ── Canvas side ── */}
        <div style={{ flex:1, display:'flex', flexDirection:'column', padding:14, gap:10 }}>
          {/* Header row */}
          <div style={{ display:'flex', alignItems:'center', gap:10 }}>
            <div style={{ flex:1, padding:'8px 16px', borderRadius:11, background:'rgba(124,58,237,.12)', border:'1px solid rgba(124,58,237,.3)', fontSize:14, fontWeight:800, color:'white', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
              {isDrawer ? `✏️  Draw: ${word}` : `🔤  ${masked}`}
            </div>
            <div style={{ padding:'7px 16px', borderRadius:11, background: tLeft<15?'rgba(239,68,68,.15)':'rgba(34,197,94,.1)', border:`1px solid ${tLeft<15?'rgba(239,68,68,.35)':'rgba(34,197,94,.25)'}`, fontSize:15, fontWeight:900, color: tLeft<15?'#f87171':'#4ade80', fontFamily:'monospace', minWidth:64, textAlign:'center' }}>
              ⏱ {tLeft}s
            </div>
            {isHost && <button onClick={onEnd} style={{ fontSize:11, color:'#6b7280', background:'none', border:'none', cursor:'pointer', fontFamily:'Outfit,sans-serif', flexShrink:0 }}>End</button>}
          </div>

          {/* Canvas */}
          <div style={{ flex:1, borderRadius:16, overflow:'hidden', background:'#f0f0f0', border:'2px solid rgba(255,255,255,.12)', minHeight:0, position:'relative', cursor: isDrawer?'crosshair':'default' }}>
            <canvas ref={canvasRef} width={900} height={540}
              style={{ width:'100%', height:'100%', display:'block', touchAction:'none' }}
              onMouseDown={onDown} onMouseMove={onMove} onMouseUp={onUp} onMouseLeave={onUp}
              onTouchStart={onDown} onTouchMove={onMove} onTouchEnd={onUp}
            />
            {!isDrawer && (
              <div style={{ position:'absolute', top:10, left:'50%', transform:'translateX(-50%)', padding:'5px 14px', borderRadius:8, background:'rgba(0,0,0,.6)', fontSize:12, color:'#e5e7eb', fontWeight:600, pointerEvents:'none', backdropFilter:'blur(4px)' }}>
                👁 Watch & guess below!
              </div>
            )}
          </div>

          {/* Toolbar */}
          {isDrawer && (
            <div style={{ display:'flex', alignItems:'center', gap:10, background:'rgba(0,0,0,.3)', borderRadius:12, padding:'9px 14px', flexWrap:'wrap' }}>
              <div style={{ display:'flex', gap:5, flexWrap:'wrap' }}>
                {PALETTE.map(c => (
                  <button key={c} onClick={()=>setColor(c)} style={{ width:20, height:20, borderRadius:'50%', background:c, border: color===c?'2.5px solid white':'1.5px solid rgba(255,255,255,.3)', cursor:'pointer', flexShrink:0 }} />
                ))}
              </div>
              <div style={{ width:1, height:22, background:'rgba(255,255,255,.12)', flexShrink:0 }} />
              <div style={{ display:'flex', gap:6, alignItems:'center' }}>
                {[3,6,10,16].map(s => (
                  <button key={s} onClick={()=>setBrush(s)} style={{ width:s+10, height:s+10, minWidth:13, minHeight:13, borderRadius:'50%', background: brush===s?color:'rgba(255,255,255,.2)', border: brush===s?'2px solid white':'1px solid transparent', cursor:'pointer', flexShrink:0 }} />
                ))}
              </div>
              <button onClick={clearAll} style={{ marginLeft:'auto', padding:'5px 12px', borderRadius:8, border:'1px solid rgba(239,68,68,.3)', background:'rgba(239,68,68,.1)', color:'#f87171', fontSize:12, fontWeight:700, cursor:'pointer', fontFamily:'Outfit,sans-serif', whiteSpace:'nowrap' }}>🗑 Clear</button>
            </div>
          )}
        </div>

        {/* ── Guesses sidebar ── */}
        <div style={{ width:220, borderLeft:'1px solid rgba(255,255,255,.06)', display:'flex', flexDirection:'column', flexShrink:0 }}>
          <div style={{ padding:'12px 14px', borderBottom:'1px solid rgba(255,255,255,.06)' }}>
            <div style={{ fontSize:13, fontWeight:800, color:'white' }}>💬 Guesses</div>
            <div style={{ fontSize:11, color:'#6b7280', marginTop:2 }}>
              {members.find(m=>m.socketId===game?.drawer)?.name?.split(' ')[0]||'?'} is drawing
            </div>
          </div>
          <div style={{ flex:1, overflowY:'auto', padding:'10px 10px', display:'flex', flexDirection:'column', gap:6 }}>
            {guesses.length===0 && <div style={{ fontSize:12, color:'#374151', textAlign:'center', paddingTop:20 }}>No guesses yet…</div>}
            {guesses.map((g,i) => (
              <div key={i} style={{ padding:'7px 10px', borderRadius:10, background: g.correct?'rgba(34,197,94,.1)':'rgba(255,255,255,.04)', border: g.correct?'1px solid rgba(34,197,94,.3)':'1px solid transparent' }}>
                <div style={{ fontSize:11, fontWeight:700, color: g.correct?'#4ade80':'#a78bfa' }}>{(g.name||'?').split(' ')[0]}</div>
                <div style={{ fontSize:12, color: g.correct?'#4ade80':'#d1d5db', marginTop:1 }}>{g.correct?`✓ ${g.word}`:g.word}</div>
              </div>
            ))}
          </div>
          {!isDrawer && (
            <div style={{ padding:10, borderTop:'1px solid rgba(255,255,255,.06)' }}>
              <div style={{ display:'flex', gap:6 }}>
                <input value={guess} onChange={e=>setGuess(e.target.value)} onKeyDown={e=>e.key==='Enter'&&sendGuess()}
                  placeholder="Your guess…"
                  style={{ flex:1, padding:'8px 10px', borderRadius:9, border:'1px solid rgba(255,255,255,.12)', background:'rgba(255,255,255,.06)', color:'white', fontSize:12, fontFamily:'Outfit,sans-serif', outline:'none' }} />
                <button onClick={sendGuess} style={{ padding:'8px 13px', borderRadius:9, border:'none', background:'#7c3aed', color:'white', fontWeight:700, cursor:'pointer', fontSize:13 }}>→</button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

/* ════════════════════════════════════════════
   DEVICE PICKER MODAL
════════════════════════════════════════════ */
function DevicePicker({ open, onClose, devices, selectedCam, setSelectedCam, selectedMic, setSelectedMic, hasPermission, requestPermissions, onApply }) {
  const previewRef  = useRef(null)
  const [previewStream, setPreviewStream] = useState(null)
  const [testing,       setTesting]       = useState(false)
  const [micLevel,      setMicLevel]      = useState(0)
  const micAnalyserRef  = useRef(null)
  const micAnimFrameRef = useRef(null)

  /* start camera preview when modal opens */
  useEffect(() => {
    if (!open) return
    let stream
    const start = async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: selectedCam ? { deviceId: { exact: selectedCam } } : { facingMode: 'user' },
          audio: false,
        })
        setPreviewStream(stream)
        if (previewRef.current) previewRef.current.srcObject = stream
      } catch {}
    }
    start()
    return () => { stream?.getTracks().forEach(t => t.stop()); setPreviewStream(null) }
  }, [open, selectedCam])

  /* mic level meter */
  useEffect(() => {
    if (!testing) { setMicLevel(0); return }
    let actx, analyser, src, anim
    navigator.mediaDevices.getUserMedia({
      audio: selectedMic ? { deviceId: { exact: selectedMic } } : true,
      video: false,
    }).then(s => {
      actx = new AudioContext()
      src  = actx.createMediaStreamSource(s)
      analyser = actx.createAnalyser(); analyser.fftSize = 256
      src.connect(analyser)
      const data = new Uint8Array(analyser.frequencyBinCount)
      const tick = () => {
        analyser.getByteFrequencyData(data)
        const avg = data.reduce((a,b)=>a+b,0) / data.length
        setMicLevel(Math.min(100, avg * 2))
        anim = requestAnimationFrame(tick)
      }
      anim = requestAnimationFrame(tick)
      micAnalyserRef.current = { s, actx, anim }
    }).catch(() => setTesting(false))
    return () => {
      cancelAnimationFrame(anim)
      micAnalyserRef.current?.s.getTracks().forEach(t=>t.stop())
      micAnalyserRef.current?.actx?.close()
    }
  }, [testing, selectedMic])

  if (!open) return null

  const camLabel  = c => c.label || `Camera ${c.deviceId.slice(0,6)}`
  const micLabel  = m => m.label || `Microphone ${m.deviceId.slice(0,6)}`

  const SELECT_STYLE = {
    width:'100%', padding:'9px 12px', borderRadius:10,
    border:'1px solid rgba(255,255,255,.15)', background:'rgba(255,255,255,.07)',
    color:'white', fontSize:13, fontFamily:'Outfit,sans-serif', outline:'none', cursor:'pointer',
  }

  return (
    <>
      {/* backdrop */}
      <div onClick={onClose} style={{ position:'fixed', inset:0, zIndex:600, background:'rgba(0,0,0,.7)', backdropFilter:'blur(10px)' }} />

      {/* modal */}
      <div style={{
        position:'fixed', top:'50%', left:'50%', transform:'translate(-50%,-50%)', zIndex:601,
        width: 460, background:'#0d0d24', border:'1px solid rgba(124,58,237,.35)',
        borderRadius:24, padding:28, boxShadow:'0 40px 100px rgba(0,0,0,.9)',
        animation:'modalIn .25s ease both', fontFamily:'Outfit,sans-serif',
      }}>
        {/* header */}
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:22 }}>
          <div>
            <div style={{ fontSize:17, fontWeight:900, color:'white' }}>⚙️ Camera &amp; Microphone</div>
            <div style={{ fontSize:12, color:'#6b7280', marginTop:2 }}>Pick which devices to use in this room</div>
          </div>
          <button onClick={onClose} style={{ width:32, height:32, borderRadius:'50%', background:'rgba(255,255,255,.08)', border:'none', color:'#9ca3af', cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', fontSize:16 }}>✕</button>
        </div>

        {/* permission banner */}
        {hasPermission === false && (
          <div style={{ padding:'12px 16px', borderRadius:12, background:'rgba(239,68,68,.1)', border:'1px solid rgba(239,68,68,.3)', marginBottom:18, display:'flex', alignItems:'center', gap:10 }}>
            <span style={{ fontSize:18 }}>🚫</span>
            <div>
              <div style={{ fontSize:13, fontWeight:700, color:'#f87171' }}>Permission denied</div>
              <div style={{ fontSize:11, color:'#6b7280', marginTop:1 }}>Allow camera &amp; mic access in your browser settings, then refresh.</div>
            </div>
          </div>
        )}
        {hasPermission === null && (
          <div style={{ display:'flex', justifyContent:'center', marginBottom:18 }}>
            <button onClick={requestPermissions} style={{ display:'flex', alignItems:'center', gap:8, padding:'10px 22px', borderRadius:12, border:'none', background:'linear-gradient(135deg,#7c3aed,#6d28d9)', color:'white', fontWeight:700, fontSize:13, cursor:'pointer', fontFamily:'Outfit,sans-serif' }}>
              🔐 Allow Camera &amp; Microphone
            </button>
          </div>
        )}

        {/* camera preview */}
        <div style={{ position:'relative', borderRadius:16, overflow:'hidden', background:'#111', aspectRatio:'16/9', marginBottom:18 }}>
          <video ref={previewRef} autoPlay muted playsInline style={{ width:'100%', height:'100%', objectFit:'cover', display:'block' }} />
          {!previewStream && (
            <div style={{ position:'absolute', inset:0, display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', gap:8 }}>
              <div style={{ fontSize:36 }}>📷</div>
              <div style={{ fontSize:12, color:'#6b7280' }}>No camera preview</div>
            </div>
          )}
          {previewStream && (
            <div style={{ position:'absolute', bottom:8, left:8, padding:'3px 10px', borderRadius:20, background:'rgba(34,197,94,.2)', border:'1px solid rgba(34,197,94,.4)', fontSize:10, color:'#4ade80', fontWeight:700 }}>
              ● LIVE
            </div>
          )}
        </div>

        {/* camera selector */}
        <div style={{ marginBottom:14 }}>
          <label style={{ display:'block', fontSize:11, color:'#9ca3af', fontWeight:700, textTransform:'uppercase', letterSpacing:'.07em', marginBottom:7 }}>
            📹 Camera
          </label>
          {devices.cameras.length === 0 ? (
            <div style={{ ...SELECT_STYLE, color:'#6b7280', cursor:'default' }}>No cameras found</div>
          ) : (
            <select value={selectedCam} onChange={e => setSelectedCam(e.target.value)} style={SELECT_STYLE}>
              {devices.cameras.map(c => (
                <option key={c.deviceId} value={c.deviceId}>{camLabel(c)}</option>
              ))}
            </select>
          )}
        </div>

        {/* mic selector + level meter */}
        <div style={{ marginBottom:22 }}>
          <label style={{ display:'block', fontSize:11, color:'#9ca3af', fontWeight:700, textTransform:'uppercase', letterSpacing:'.07em', marginBottom:7 }}>
            🎤 Microphone
          </label>
          {devices.mics.length === 0 ? (
            <div style={{ ...SELECT_STYLE, color:'#6b7280', cursor:'default' }}>No microphones found</div>
          ) : (
            <select value={selectedMic} onChange={e => setSelectedMic(e.target.value)} style={SELECT_STYLE}>
              {devices.mics.map(m => (
                <option key={m.deviceId} value={m.deviceId}>{micLabel(m)}</option>
              ))}
            </select>
          )}
          {/* mic level bar */}
          <div style={{ marginTop:10 }}>
            <div style={{ display:'flex', alignItems:'center', gap:10 }}>
              <div style={{ flex:1, height:6, borderRadius:3, background:'rgba(255,255,255,.08)', overflow:'hidden' }}>
                <div style={{ height:'100%', width:`${micLevel}%`, background: micLevel > 60 ? '#22c55e' : micLevel > 30 ? '#f59e0b' : '#7c3aed', transition:'width .06s', borderRadius:3 }} />
              </div>
              <button onClick={() => setTesting(t => !t)} style={{ fontSize:11, color: testing ? '#22c55e' : '#9ca3af', background:'none', border:`1px solid ${testing?'rgba(34,197,94,.4)':'rgba(255,255,255,.12)'}`, borderRadius:8, padding:'4px 10px', cursor:'pointer', fontFamily:'Outfit,sans-serif', fontWeight:700, whiteSpace:'nowrap' }}>
                {testing ? '■ Stop' : '▶ Test mic'}
              </button>
            </div>
            {testing && micLevel === 0 && <div style={{ fontSize:10, color:'#6b7280', marginTop:4 }}>Speak into your mic…</div>}
          </div>
        </div>

        {/* action buttons */}
        <div style={{ display:'flex', gap:10 }}>
          <button onClick={onClose} style={{ flex:1, padding:'11px', borderRadius:12, border:'1px solid rgba(255,255,255,.12)', background:'transparent', color:'#9ca3af', fontWeight:700, fontSize:13, cursor:'pointer', fontFamily:'Outfit,sans-serif' }}>
            Cancel
          </button>
          <button onClick={() => { onApply(selectedCam, selectedMic); onClose() }}
            style={{ flex:2, padding:'11px', borderRadius:12, border:'none', background:'linear-gradient(135deg,#7c3aed,#6d28d9)', color:'white', fontWeight:700, fontSize:13, cursor:'pointer', fontFamily:'Outfit,sans-serif' }}>
            ✓ Apply &amp; Join
          </button>
        </div>
      </div>
    </>
  )
}

/* ════════════════════════════════════════════
   GAMES VIEW  (lobby + all 4 games)
════════════════════════════════════════════ */
const GCARDS = [
  { id:'trivia',    emoji:'🎯', name:'Trivia Quiz',       desc:'5 rapid-fire questions, time-bonus scoring',       players:'2-8', color:'#7c3aed' },
  { id:'draw',      emoji:'🎨', name:'Draw & Guess',      desc:'One draws, everyone guesses the word.',             players:'2-8', color:'#f59e0b' },
  { id:'wyr',       emoji:'🤔', name:'Would You Rather',  desc:'Vote A or B — see what the group picks.',           players:'2-8', color:'#ec4899' },
  { id:'mlt',       emoji:'👑', name:'Most Likely To',    desc:'Vote for who in the room fits each prompt.',        players:'2-8', color:'#14b8a6' },
  { id:'emoji',     emoji:'🧩', name:'Emoji Riddle',      desc:'Guess the movie or show from emoji clues.',         players:'2-8', color:'#f97316' },
  { id:'wordchain', emoji:'🔤', name:'Word Chain',         desc:'Chain words by last letter. No repeats!',           players:'2-8', color:'#22c55e' },
  { id:'rps',       emoji:'✂️',  name:'Rock Paper ✂',      desc:'Classic best-of-3. Fast & ruthless.',               players:'2',   color:'#3b82f6' },
]
const OC = ['#7c3aed','#3b82f6','#22c55e','#f59e0b']
const RPS_C = [{id:'rock',emoji:'🪨',label:'Rock'},{id:'paper',emoji:'📄',label:'Paper'},{id:'scissors',emoji:'✂️',label:'Scissors'}]

function GamesView({ game, members, isHost, onStart, onAction, onEnd, selfId }) {
  const [wcIn,    setWcIn]    = useState('')
  const [wcErr,   setWcErr]   = useState('')
  const [lAns,    setLAns]    = useState(null)
  const [emojiIn, setEmojiIn] = useState('')
  const [emojiOk, setEmojiOk] = useState(null) // null | true | false
  useEffect(() => { setLAns(null) }, [game?.qIndex])
  useEffect(() => { setEmojiOk(null); setEmojiIn('') }, [game?.rIndex])

  /* ── lobby ── */
  if (!game) return (
    <div style={{ flex:1, display:'flex', flexDirection:'column', overflow:'hidden' }}>
      <Strip members={members} />
      <div style={{ flex:1, overflowY:'auto', padding:24 }}>
        <div style={{ marginBottom:20 }}>
          <h2 style={{ fontSize:22, fontWeight:900, color:'white', margin:'0 0 6px' }}>🎮 Game Room</h2>
          <p style={{ fontSize:13, color:'#6b7280', margin:0 }}>
            {isHost ? 'Pick a game below to start for everyone in the room.' : 'Waiting for the host to pick a game…'}
          </p>
        </div>
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:14 }}>
          {GCARDS.map(g => (
            <button key={g.id} onClick={()=>isHost && onStart(g.id)} disabled={!isHost}
              style={{ padding:20, borderRadius:18, border:`1.5px solid ${g.color}44`, background:`${g.color}12`, cursor:isHost?'pointer':'not-allowed', textAlign:'left', opacity:isHost?1:.65, fontFamily:'Outfit,sans-serif', transition:'all .2s' }}
              onMouseEnter={e=>{ if(isHost){e.currentTarget.style.borderColor=g.color;e.currentTarget.style.transform='translateY(-2px)'}}}
              onMouseLeave={e=>{ e.currentTarget.style.borderColor=`${g.color}44`;e.currentTarget.style.transform='none' }}>
              <div style={{ fontSize:32, marginBottom:10 }}>{g.emoji}</div>
              <div style={{ fontSize:15, fontWeight:800, color:'white', marginBottom:4 }}>{g.name}</div>
              <div style={{ fontSize:12, color:'#9ca3af', marginBottom:10, lineHeight:1.5 }}>{g.desc}</div>
              <span style={{ fontSize:11, color:g.color, fontWeight:700, background:`${g.color}22`, padding:'3px 10px', borderRadius:20 }}>{g.players} players</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  )

  /* ── draw & guess ── */
  if (game.type === 'draw') return (
    <DrawView game={game} members={members} isHost={isHost} onAction={onAction} onEnd={onEnd} selfId={selfId} />
  )

  /* ── results ── */
  if (game.phase === 'results') {
    const sorted = Object.entries(game.scores||{}).sort(([,a],[,b])=>b-a)
    const med = ['🥇','🥈','🥉']
    const nm = id => members.find(m=>m.socketId===id)?.name || id
    const av = id => members.find(m=>m.socketId===id)?.avatar
    return (
      <div style={{ flex:1, display:'flex', flexDirection:'column', overflow:'hidden' }}>
        <Strip members={members} scores={game.scores} />
        <div style={{ flex:1, overflowY:'auto', padding:24 }}>
          <div style={{ textAlign:'center', marginBottom:24 }}>
            <div style={{ fontSize:44, marginBottom:8 }}>🏆</div>
            <h2 style={{ fontSize:22, fontWeight:900, color:'white', margin:0 }}>Game Over!</h2>
          </div>
          <div style={{ display:'flex', flexDirection:'column', gap:10, marginBottom:20 }}>
            {sorted.map(([id,sc],i) => (
              <div key={id} style={{ display:'flex', alignItems:'center', gap:12, padding:'12px 16px', borderRadius:14, background:i===0?'rgba(245,158,11,.1)':'rgba(255,255,255,.04)', border:i===0?'1px solid rgba(245,158,11,.35)':'1px solid rgba(255,255,255,.06)' }}>
                <div style={{ fontSize:22, width:30, textAlign:'center' }}>{med[i]||`#${i+1}`}</div>
                <img src={AV(av(id),34)} style={{ width:34, height:34, borderRadius:'50%' }} />
                <div style={{ flex:1, fontSize:14, fontWeight:700, color:'white' }}>{nm(id)}{id===selfId?' (You)':''}</div>
                <div style={{ fontSize:18, fontWeight:900, color:i===0?'#f59e0b':'#a78bfa' }}>{sc}pts</div>
              </div>
            ))}
          </div>
          {isHost && <button onClick={onEnd} style={{ width:'100%', padding:14, borderRadius:14, border:'1px solid rgba(255,255,255,.12)', background:'transparent', color:'#9ca3af', fontWeight:700, fontSize:14, cursor:'pointer', fontFamily:'Outfit,sans-serif' }}>← Back to Games</button>}
        </div>
      </div>
    )
  }

  /* ── trivia ── */
  if (game.type === 'trivia' && game.phase === 'question') {
    const q = game.current
    const myAns   = game.answers?.[selfId]
    const answered = myAns != null || lAns != null
    const elapsed  = (Date.now() - game.questionStartedAt) / 1000
    const pct      = Math.max(0, ((15-elapsed)/15)*100)
    return (
      <div style={{ flex:1, display:'flex', flexDirection:'column', overflow:'hidden' }}>
        <Strip members={members} scores={game.scores} />
        <div style={{ flex:1, overflowY:'auto', padding:24, display:'flex', flexDirection:'column', gap:16 }}>
          <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between' }}>
            <span style={{ fontSize:13, color:'#6b7280', fontWeight:700 }}>Q {game.qIndex+1} / {game.totalQ}</span>
            {isHost && <button onClick={onEnd} style={{ fontSize:11, color:'#6b7280', background:'none', border:'none', cursor:'pointer', fontFamily:'Outfit,sans-serif' }}>End game</button>}
          </div>
          <div style={{ height:5, borderRadius:5, background:'rgba(255,255,255,.08)', overflow:'hidden' }}>
            <div style={{ height:'100%', width:`${pct}%`, borderRadius:5, background:pct<33?'#ef4444':pct<66?'#f59e0b':'#7c3aed', transition:'width 1s linear' }} />
          </div>
          <div style={{ padding:24, borderRadius:18, background:'rgba(124,58,237,.1)', border:'1px solid rgba(124,58,237,.25)', textAlign:'center' }}>
            <div style={{ fontSize:18, fontWeight:800, color:'white', lineHeight:1.5 }}>{q.q}</div>
          </div>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
            {q.opts.map((opt,i) => {
              const pick = lAns===i
              const srv  = game.answers?.[selfId]
              const show = srv!=null
              let bg=`${OC[i]}18`, bd=`${OC[i]}44`, cl='white'
              if (show) {
                if (i===q.ans)         { bg='rgba(34,197,94,.2)'; bd='#22c55e'; cl='#22c55e' }
                else if (srv?.index===i){ bg='rgba(239,68,68,.2)'; bd='#ef4444'; cl='#ef4444' }
              } else if (pick)          { bg=`${OC[i]}35`; bd=OC[i] }
              return (
                <button key={i} disabled={answered} onClick={()=>{setLAns(i);onAction({answerIndex:i})}}
                  style={{ padding:'13px 15px', borderRadius:14, border:`1.5px solid ${bd}`, background:bg, color:cl, cursor:answered?'default':'pointer', fontFamily:'Outfit,sans-serif', fontSize:13, fontWeight:700, textAlign:'left', transition:'all .2s' }}>
                  <span style={{ opacity:.55, marginRight:8 }}>{String.fromCharCode(65+i)}.</span>{opt}
                </button>
              )
            })}
          </div>
          {answered && <div style={{ textAlign:'center', fontSize:13, color:game.answers?.[selfId]?.correct?'#22c55e':'#ef4444', fontWeight:700 }}>
            {game.answers?.[selfId]?.correct ? `✓ Correct! +${game.answers[selfId].points}pts` : '✗ Wrong — waiting for others…'}
          </div>}
        </div>
      </div>
    )
  }

  /* ── rps ── */
  if (game.type === 'rps') {
    const players = Object.keys(game.scores||{})
    const oppId   = players.find(id=>id!==selfId)
    const oppM    = members.find(m=>m.socketId===oppId)
    const myC     = game.choices?.[selfId]
    const oppC    = game.choices?.[oppId]
    return (
      <div style={{ flex:1, display:'flex', flexDirection:'column', overflow:'hidden' }}>
        <Strip members={members} />
        <div style={{ flex:1, overflowY:'auto', padding:24, display:'flex', flexDirection:'column', gap:18 }}>
          <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between' }}>
            <h2 style={{ fontSize:20, fontWeight:900, color:'white', margin:0 }}>✂️ Rock Paper Scissors</h2>
            {isHost && <button onClick={onEnd} style={{ fontSize:11, color:'#6b7280', background:'none', border:'none', cursor:'pointer', fontFamily:'Outfit,sans-serif' }}>End</button>}
          </div>
          <div style={{ display:'flex', borderRadius:18, overflow:'hidden', border:'1px solid rgba(255,255,255,.1)' }}>
            {[
              { label:'You',   score:game.scores?.[selfId]||0, color:'#a78bfa', bg:'rgba(124,58,237,.1)' },
              { label:'VS',    score:null,                      color:'#4b5563', bg:'rgba(255,255,255,.04)' },
              { label:oppM?.name.split(' ')[0]||'Opponent', score:game.scores?.[oppId]||0, color:'#60a5fa', bg:'rgba(59,130,246,.1)' },
            ].map((s,i) => (
              <div key={i} style={{ flex: i===1?0:1, padding:i===1?'14px 18px':14, textAlign:'center', background:s.bg, display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center' }}>
                <div style={{ fontSize:13, color:'white', fontWeight:700, marginBottom:i===1?0:4 }}>{s.label}</div>
                {s.score!=null && <div style={{ fontSize:28, fontWeight:900, color:s.color }}>{s.score}</div>}
              </div>
            ))}
          </div>
          {(game.phase==='result'||game.phase==='results') && myC && oppC && (
            <div style={{ textAlign:'center', padding:20, borderRadius:18, background:'rgba(255,255,255,.04)', border:'1px solid rgba(255,255,255,.1)' }}>
              <div style={{ display:'flex', justifyContent:'center', gap:40 }}>
                {[{c:myC,l:'You'},{c:oppC,l:oppM?.name.split(' ')[0]||'Opponent'}].map(({c,l}) => (
                  <div key={l} style={{ textAlign:'center' }}>
                    <div style={{ fontSize:48 }}>{RPS_C.find(x=>x.id===c)?.emoji}</div>
                    <div style={{ fontSize:11, color:'#9ca3af', marginTop:4 }}>{l}</div>
                  </div>
                ))}
              </div>
            </div>
          )}
          {game.phase==='choosing' && (
            <div>
              <div style={{ fontSize:12, color:'#6b7280', fontWeight:700, textAlign:'center', marginBottom:14 }}>
                {myC ? 'Waiting for opponent…' : 'Make your move 👇'}
              </div>
              <div style={{ display:'flex', gap:12, justifyContent:'center' }}>
                {RPS_C.map(c => (
                  <button key={c.id} onClick={()=>!myC&&onAction({choice:c.id})} disabled={!!myC}
                    style={{ flex:1, maxWidth:110, padding:'16px 8px', borderRadius:16, border:`1.5px solid ${myC===c.id?'#7c3aed':'rgba(255,255,255,.12)'}`, background:myC===c.id?'rgba(124,58,237,.25)':'rgba(255,255,255,.06)', cursor:myC?'default':'pointer', textAlign:'center', fontFamily:'Outfit,sans-serif', transition:'all .2s' }}>
                    <div style={{ fontSize:36, marginBottom:6 }}>{c.emoji}</div>
                    <div style={{ fontSize:12, color:'white', fontWeight:700 }}>{c.label}</div>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    )
  }

  /* ── word chain ── */
  if (game.type === 'wordchain') {
    const myTurn  = game.turn === selfId
    const last    = game.chain?.[game.chain.length-1]?.word || 'Apple'
    const req     = last[last.length-1].toUpperCase()
    const go = () => {
      if (!wcIn.trim()) return
      onAction({ word:wcIn.trim() }, res => {
        if (!res?.ok) { setWcErr(res?.error||'Invalid'); return }
        setWcIn(''); setWcErr('')
      })
    }
    return (
      <div style={{ flex:1, display:'flex', flexDirection:'column', overflow:'hidden' }}>
        <Strip members={members} scores={game.scores} />
        <div style={{ flex:1, overflowY:'auto', padding:24, display:'flex', flexDirection:'column', gap:14 }}>
          <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between' }}>
            <h2 style={{ fontSize:20, fontWeight:900, color:'white', margin:0 }}>🔤 Word Chain</h2>
            {isHost && <button onClick={onEnd} style={{ fontSize:11, color:'#6b7280', background:'none', border:'none', cursor:'pointer', fontFamily:'Outfit,sans-serif' }}>End</button>}
          </div>
          <div style={{ padding:12, borderRadius:12, background:myTurn?'rgba(34,197,94,.08)':'rgba(255,255,255,.04)', border:`1px solid ${myTurn?'rgba(34,197,94,.25)':'rgba(255,255,255,.08)'}`, fontSize:13, color:myTurn?'#86efac':'#6b7280' }}>
            {myTurn ? `Your turn! Say a word starting with "${req}"` : `Waiting for ${members.find(m=>m.socketId===game.turn)?.name?.split(' ')[0]||'someone'}…`}
          </div>
          <div style={{ display:'flex', flexWrap:'wrap', gap:8 }}>
            {(game.chain||[]).map((e,i) => (
              <div key={i} style={{ display:'flex', alignItems:'center', gap:5 }}>
                <span style={{ padding:'5px 12px', borderRadius:20, background:i===game.chain.length-1?'rgba(124,58,237,.3)':'rgba(255,255,255,.07)', border:i===game.chain.length-1?'1px solid #7c3aed':'1px solid rgba(255,255,255,.1)', fontSize:13, fontWeight:700, color:i===game.chain.length-1?'#c4b5fd':'#d1d5db' }}>{e.word}</span>
                {i<game.chain.length-1 && <span style={{ color:'#374151', fontSize:12 }}>→</span>}
              </div>
            ))}
          </div>
          <div style={{ padding:10, borderRadius:10, background:'rgba(255,255,255,.04)', fontSize:13, color:'#6b7280' }}>
            Next word must start with: <strong style={{ color:'#a78bfa', fontSize:16 }}>{req}</strong>
          </div>
          {wcErr && <div style={{ fontSize:13, color:'#ef4444', fontWeight:700 }}>⚠ {wcErr}</div>}
          <div style={{ display:'flex', gap:10 }}>
            <input value={wcIn} onChange={e=>{setWcIn(e.target.value);setWcErr('')}}
              onKeyDown={e=>e.key==='Enter'&&myTurn&&go()} disabled={!myTurn}
              placeholder={myTurn?`Word starting with "${req}"…`:'Not your turn…'}
              style={{ flex:1, padding:'11px 14px', borderRadius:12, border:'1px solid rgba(255,255,255,.15)', background:'rgba(255,255,255,.06)', color:'white', fontSize:13, fontFamily:'Outfit,sans-serif', outline:'none', opacity:myTurn?1:.5 }} />
            <button onClick={go} disabled={!myTurn} style={{ padding:'11px 20px', borderRadius:12, border:'none', background:myTurn?'#22c55e':'#374151', color:'white', fontWeight:800, fontSize:13, cursor:myTurn?'pointer':'default', fontFamily:'Outfit,sans-serif' }}>Go →</button>
          </div>
          <div style={{ fontSize:12, color:'#4b5563', textAlign:'center' }}>{(game.chain||[]).length} words · {Object.values(game.scores||{}).reduce((a,b)=>a+b,0)} total pts</div>
        </div>
      </div>
    )
  }

  /* ── would you rather ── */
  if (game.type === 'wyr') {
    const q       = game.current
    const myVote  = game.votes?.[selfId]
    const reveal  = game.phase === 'reveal'
    const aCount  = game.results?.aCount ?? 0
    const bCount  = game.results?.bCount ?? 0
    const total   = aCount + bCount || 1
    return (
      <div style={{ flex:1, display:'flex', flexDirection:'column', overflow:'hidden' }}>
        <Strip members={members} scores={game.scores} />
        <div style={{ flex:1, overflowY:'auto', padding:20, display:'flex', flexDirection:'column', gap:14 }}>
          <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between' }}>
            <div>
              <span style={{ fontSize:11, color:'#ec4899', fontWeight:800, textTransform:'uppercase', letterSpacing:'.08em' }}>Would You Rather</span>
              <span style={{ fontSize:11, color:'#4b5563', marginLeft:8 }}>{game.qIndex+1}/{game.totalQ}</span>
            </div>
            {isHost && <button onClick={onEnd} style={{ fontSize:11, color:'#6b7280', background:'none', border:'none', cursor:'pointer', fontFamily:'Outfit,sans-serif' }}>End</button>}
          </div>
          {['A','B'].map((opt, i) => {
            const text  = i === 0 ? q?.a : q?.b
            const count = i === 0 ? aCount : bCount
            const pct   = reveal ? Math.round((count/total)*100) : 0
            const voted = myVote === opt
            const isMaj = reveal && game.results?.majority === opt
            return (
              <button key={opt} disabled={!!myVote || reveal}
                onClick={() => { if (!myVote) onAction({ vote: opt }) }}
                style={{
                  padding:'18px 20px', borderRadius:18, textAlign:'left', fontFamily:'Outfit,sans-serif',
                  border:`1.5px solid ${voted||isMaj ? '#ec4899' : 'rgba(255,255,255,.1)'}`,
                  background: voted||isMaj ? 'rgba(236,72,153,.15)' : 'rgba(255,255,255,.04)',
                  cursor: myVote||reveal ? 'default' : 'pointer',
                  position:'relative', overflow:'hidden', transition:'all .2s',
                }}>
                {reveal && (
                  <div style={{ position:'absolute', left:0, top:0, bottom:0, width:`${pct}%`, background:'rgba(236,72,153,.12)', transition:'width .6s ease', borderRadius:16 }} />
                )}
                <div style={{ position:'relative', display:'flex', alignItems:'center', gap:10 }}>
                  <div style={{ width:28, height:28, borderRadius:10, background:'rgba(236,72,153,.2)', border:'1px solid rgba(236,72,153,.4)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:13, fontWeight:900, color:'#f472b6', flexShrink:0 }}>{opt}</div>
                  <span style={{ fontSize:14, fontWeight:700, color:'white', flex:1, lineHeight:1.4 }}>{text}</span>
                  {reveal && <span style={{ fontSize:14, fontWeight:900, color:'#ec4899', flexShrink:0 }}>{pct}%</span>}
                </div>
              </button>
            )
          })}
          {myVote && !reveal && (
            <div style={{ textAlign:'center', fontSize:13, color:'#9ca3af', fontWeight:600 }}>
              You chose <strong style={{ color:'#ec4899' }}>{myVote}</strong> — waiting for others…
            </div>
          )}
          {reveal && (
            <div style={{ textAlign:'center', padding:12, borderRadius:14, background:'rgba(236,72,153,.08)', border:'1px solid rgba(236,72,153,.2)', fontSize:13, color:'#f472b6', fontWeight:700 }}>
              {aCount} vs {bCount} — {game.results?.majority === 'A' ? q?.a : q?.b} wins!
            </div>
          )}
        </div>
      </div>
    )
  }

  /* ── most likely to ── */
  if (game.type === 'mlt') {
    const myVote = game.votes?.[selfId]
    const reveal = game.phase === 'reveal'
    const nm     = id => members.find(m=>m.socketId===id)?.name?.split(' ')[0] || 'Someone'
    const av     = id => members.find(m=>m.socketId===id)?.avatar
    const tally  = game.results?.tally || {}
    const winners = game.results?.winners || []
    return (
      <div style={{ flex:1, display:'flex', flexDirection:'column', overflow:'hidden' }}>
        <Strip members={members} scores={game.scores} />
        <div style={{ flex:1, overflowY:'auto', padding:20, display:'flex', flexDirection:'column', gap:14 }}>
          <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between' }}>
            <div>
              <span style={{ fontSize:11, color:'#14b8a6', fontWeight:800, textTransform:'uppercase', letterSpacing:'.08em' }}>Most Likely To</span>
              <span style={{ fontSize:11, color:'#4b5563', marginLeft:8 }}>{game.qIndex+1}/{game.totalQ}</span>
            </div>
            {isHost && <button onClick={onEnd} style={{ fontSize:11, color:'#6b7280', background:'none', border:'none', cursor:'pointer', fontFamily:'Outfit,sans-serif' }}>End</button>}
          </div>
          <div style={{ padding:20, borderRadius:18, background:'rgba(20,184,166,.1)', border:'1px solid rgba(20,184,166,.25)', textAlign:'center' }}>
            <div style={{ fontSize:11, color:'#5eead4', fontWeight:700, marginBottom:8, textTransform:'uppercase', letterSpacing:'.06em' }}>Who is most likely to…</div>
            <div style={{ fontSize:20, fontWeight:900, color:'white', lineHeight:1.4 }}>{game.current}</div>
          </div>
          {!myVote && !reveal && (
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
              {(game.players||[]).filter(id => id !== selfId).map(id => (
                <button key={id} onClick={() => onAction({ vote: id })}
                  style={{ padding:'12px 14px', borderRadius:14, border:'1px solid rgba(20,184,166,.25)', background:'rgba(20,184,166,.08)', cursor:'pointer', display:'flex', alignItems:'center', gap:10, fontFamily:'Outfit,sans-serif', transition:'all .2s' }}
                  onMouseEnter={e=>{e.currentTarget.style.borderColor='rgba(20,184,166,.6)';e.currentTarget.style.background='rgba(20,184,166,.18)'}}
                  onMouseLeave={e=>{e.currentTarget.style.borderColor='rgba(20,184,166,.25)';e.currentTarget.style.background='rgba(20,184,166,.08)'}}>
                  <img src={AV(av(id),30)} style={{ width:30, height:30, borderRadius:'50%' }} />
                  <span style={{ fontSize:13, fontWeight:700, color:'white' }}>{nm(id)}</span>
                </button>
              ))}
            </div>
          )}
          {myVote && !reveal && (
            <div style={{ textAlign:'center', fontSize:13, color:'#9ca3af', fontWeight:600 }}>
              You voted for <strong style={{ color:'#14b8a6' }}>{nm(myVote)}</strong> — waiting for others…
            </div>
          )}
          {reveal && (
            <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
              {(game.players||[]).map(id => {
                const votes  = tally[id] || 0
                const isWin  = winners.includes(id)
                return (
                  <div key={id} style={{ display:'flex', alignItems:'center', gap:12, padding:'10px 14px', borderRadius:14, background: isWin?'rgba(20,184,166,.12)':'rgba(255,255,255,.04)', border:`1px solid ${isWin?'rgba(20,184,166,.4)':'rgba(255,255,255,.07)'}` }}>
                    <img src={AV(av(id),32)} style={{ width:32, height:32, borderRadius:'50%' }} />
                    <span style={{ flex:1, fontSize:13, fontWeight:700, color:'white' }}>{nm(id)}{id===selfId?' (You)':''}</span>
                    {isWin && <span style={{ fontSize:16 }}>👑</span>}
                    <span style={{ fontSize:13, fontWeight:800, color: isWin?'#14b8a6':'#6b7280' }}>{votes} vote{votes!==1?'s':''}</span>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>
    )
  }

  /* ── emoji riddle ── */
  if (game.type === 'emoji') {
    const reveal   = game.phase === 'reveal'
    const alreadyCorrect = game.correctGuessers?.includes(selfId)
    const submitEmoji = () => {
      if (!emojiIn.trim() || alreadyCorrect || reveal) return
      onAction({ guess: emojiIn.trim() }, res => {
        if (res?.correct) { setEmojiOk(true) }
        else { setEmojiOk(false); setTimeout(() => setEmojiOk(null), 1000) }
        setEmojiIn('')
      })
    }
    return (
      <div style={{ flex:1, display:'flex', flexDirection:'column', overflow:'hidden' }}>
        <Strip members={members} scores={game.scores} />
        <div style={{ flex:1, overflowY:'auto', padding:20, display:'flex', flexDirection:'column', gap:14 }}>
          <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between' }}>
            <div>
              <span style={{ fontSize:11, color:'#f97316', fontWeight:800, textTransform:'uppercase', letterSpacing:'.08em' }}>Emoji Riddle</span>
              <span style={{ fontSize:11, color:'#4b5563', marginLeft:8 }}>{game.rIndex+1}/{game.totalR}</span>
            </div>
            {isHost && <button onClick={onEnd} style={{ fontSize:11, color:'#6b7280', background:'none', border:'none', cursor:'pointer', fontFamily:'Outfit,sans-serif' }}>End</button>}
          </div>
          {/* countdown bar */}
          <div style={{ height:4, borderRadius:4, background:'rgba(255,255,255,.08)', overflow:'hidden' }}>
            <div style={{ height:'100%', width:`${(game.timeLeft/30)*100}%`, borderRadius:4, background: game.timeLeft > 10 ? '#f97316' : '#ef4444', transition:'width 1s linear' }} />
          </div>
          {/* emoji display */}
          <div style={{ padding:28, borderRadius:20, background:'rgba(249,115,22,.1)', border:'1px solid rgba(249,115,22,.25)', textAlign:'center' }}>
            <div style={{ fontSize:44, letterSpacing:8, marginBottom:12 }}>{game.current?.emojis}</div>
            <div style={{ fontSize:11, color:'#9ca3af', fontWeight:600 }}>What movie / TV show is this? · {game.timeLeft}s left</div>
          </div>
          {/* reveal answer */}
          {reveal && (
            <div style={{ padding:16, borderRadius:14, background:'rgba(249,115,22,.15)', border:'1px solid rgba(249,115,22,.4)', textAlign:'center' }}>
              <div style={{ fontSize:11, color:'#f97316', fontWeight:700, marginBottom:4 }}>The answer was…</div>
              <div style={{ fontSize:20, fontWeight:900, color:'white', textTransform:'capitalize' }}>{game.current?.answer}</div>
            </div>
          )}
          {/* who guessed right */}
          {(game.correctGuessers||[]).length > 0 && (
            <div style={{ display:'flex', flexWrap:'wrap', gap:8 }}>
              {game.correctGuessers.map((id, i) => {
                const m = members.find(x=>x.socketId===id)
                const pts = i===0?120:i===1?80:50
                return (
                  <div key={id} style={{ display:'flex', alignItems:'center', gap:6, padding:'5px 12px', borderRadius:20, background:'rgba(34,197,94,.1)', border:'1px solid rgba(34,197,94,.3)' }}>
                    <img src={AV(m?.avatar,20)} style={{ width:20, height:20, borderRadius:'50%' }} />
                    <span style={{ fontSize:12, fontWeight:700, color:'#86efac' }}>{m?.name?.split(' ')[0]||'?'} +{pts}pts</span>
                  </div>
                )
              })}
            </div>
          )}
          {/* input */}
          {!alreadyCorrect && !reveal && (
            <div style={{ display:'flex', gap:10 }}>
              <input
                value={emojiIn}
                onChange={e=>{setEmojiIn(e.target.value);setEmojiOk(null)}}
                onKeyDown={e=>e.key==='Enter'&&submitEmoji()}
                placeholder="Type your guess…"
                style={{ flex:1, padding:'11px 14px', borderRadius:12, border:`1px solid ${emojiOk===false?'rgba(239,68,68,.6)':emojiOk===true?'rgba(34,197,94,.6)':'rgba(255,255,255,.15)'}`, background:'rgba(255,255,255,.06)', color:'white', fontSize:13, fontFamily:'Outfit,sans-serif', outline:'none', transition:'border .2s' }} />
              <button onClick={submitEmoji}
                style={{ padding:'11px 20px', borderRadius:12, border:'none', background:'linear-gradient(135deg,#f97316,#ea580c)', color:'white', fontWeight:800, fontSize:13, cursor:'pointer', fontFamily:'Outfit,sans-serif' }}>Guess →</button>
            </div>
          )}
          {alreadyCorrect && !reveal && (
            <div style={{ textAlign:'center', padding:14, borderRadius:14, background:'rgba(34,197,94,.1)', border:'1px solid rgba(34,197,94,.3)', fontSize:13, fontWeight:700, color:'#86efac' }}>
              ✓ You got it! Waiting for others…
            </div>
          )}
          {emojiOk === false && (
            <div style={{ textAlign:'center', fontSize:12, color:'#f87171', fontWeight:700 }}>✗ Not quite — try again!</div>
          )}
        </div>
      </div>
    )
  }

  return <div style={{ flex:1, display:'flex', alignItems:'center', justifyContent:'center' }}><Loader size={24} color="#7c3aed" style={{ animation:'spin 1s linear infinite' }} /></div>
}

/* ════════════════════════════════════════════
   ROOM PAGE
════════════════════════════════════════════ */
export default function Room() {
  const { id: code } = useParams()
  const { user }     = useUser()
  const nav          = useNavigate()

  const {
    connected, roomData, members, messages, game, isHost, selfSocketId,
    sendMessage, updateStatus, startGame, gameAction, endGame,
    watchVideo, setVideo, stopVideo, playVideo, pauseVideo, seekVideo,
  } = useRoom(code)

  /* ── LiveKit WebRTC ─────────────────────────────────────────── */
  const {
    micEnabled:          lkMic,
    camEnabled:          lkCam,
    screenSharing:       lkScreen,
    toggleMic:           lkToggleMic,
    toggleCam:           lkToggleCam,
    toggleScreen:        lkToggleScreen,
    localParticipant:    lkLocal,
    remoteParticipants:  lkRemote,
    connectionState:     lkState,
  } = useLiveKit({
    roomCode:    roomData?.code,
    identity:    selfSocketId,
    displayName: user?.firstName || user?.username || 'User',
    enabled:     !!roomData && !!selfSocketId,
  })

  /* ── Local media (getUserMedia — works without LiveKit keys) ── */
  const {
    devices,
    selectedCam, setSelectedCam,
    selectedMic, setSelectedMic,
    hasPermission,
    requestPermissions,
    camStream,
    micStream,
    enableCamera,
    disableCamera,
    enableMic,
    disableMic,
  } = useLocalMedia()

  const [muted,        setMuted]        = useState(true)
  const [camOn,        setCamOn]        = useState(false)
  const [sharing,      setSharing]      = useState(false)
  const [handUp,       setHandUp]       = useState(false)
  const [chatOpen,     setChatOpen]     = useState(false)
  const [watchOpen,    setWatchOpen]    = useState(false)
  const [gamesOpen,    setGamesOpen]    = useState(false)
  const [sideOpen,     setSideOpen]     = useState(false)
  const [deviceOpen,   setDeviceOpen]   = useState(false)
  const [chatInput,    setChatInput]    = useState('')
  const [unread,       setUnread]       = useState(0)
  const [copied,       setCopied]       = useState(false)
  const [elapsed,      setElapsed]      = useState(0)
  const [toasts,       setToasts]       = useState([])
  const [shareOpen,    setShareOpen]    = useState(false)
  const chatEnd       = useRef(null)
  const toastRef      = useRef(0)
  const screenStreamRef = useRef(null)
  const [screenStream,  setScreenStream] = useState(null)

  /* ── Self speaking detection (AudioContext analyser on mic stream) ── */
  const [selfSpeaking, setSelfSpeaking] = useState(false)
  useEffect(() => {
    if (!micStream || muted) { setSelfSpeaking(false); return }
    let actx, raf
    try {
      actx = new AudioContext()
      const src      = actx.createMediaStreamSource(micStream)
      const analyser = actx.createAnalyser()
      analyser.fftSize               = 256
      analyser.smoothingTimeConstant = 0.6
      src.connect(analyser)
      const data = new Uint8Array(analyser.frequencyBinCount)
      const tick = () => {
        analyser.getByteFrequencyData(data)
        const avg = data.reduce((a, b) => a + b, 0) / data.length
        setSelfSpeaking(avg > 12)
        raf = requestAnimationFrame(tick)
      }
      raf = requestAnimationFrame(tick)
    } catch {}
    return () => { cancelAnimationFrame(raf); actx?.close() }
  }, [micStream, muted])

  /* clean up native screen capture on unmount */
  useEffect(() => () => {
    screenStreamRef.current?.getTracks().forEach(t => t.stop())
  }, [])

  /* ── Toasts ── */
  const toast = useCallback((msg, color='#7c3aed', icon='👋') => {
    const id = ++toastRef.current
    setToasts(t => [...t, { id, msg, color, icon }])
    setTimeout(() => setToasts(t => t.filter(x=>x.id!==id)), 4000)
  }, [])

  useEffect(() => {
    const onJoin = m    => toast(`${m.name.split(' ')[0]} joined`, '#22c55e', '🟢')
    const onLeft = data => toast(`${data?.name?.split(' ')[0]||'Someone'} left`, '#f59e0b', '🟡')
    socket.on('memberJoined', onJoin)
    socket.on('memberLeft',   onLeft)
    return () => { socket.off('memberJoined', onJoin); socket.off('memberLeft', onLeft) }
  }, [toast])

  /* ── Timer ── */
  useEffect(() => {
    const t = setInterval(() => setElapsed(e=>e+1), 1000)
    return () => clearInterval(t)
  }, [])
  const fmt = s => `${String(Math.floor(s/3600)).padStart(2,'0')}:${String(Math.floor((s%3600)/60)).padStart(2,'0')}:${String(s%60).padStart(2,'0')}`

  /* ── Unread badge ── */
  useEffect(() => {
    if (!chatOpen && messages.length > 0) setUnread(u => u + 1)
  }, [messages.length])
  useEffect(() => { if (chatOpen) setUnread(0) }, [chatOpen])

  /* ── Chat scroll ── */
  useEffect(() => { chatEnd.current?.scrollIntoView({ behavior:'smooth' }) }, [messages])

  /* ── Sync initial status when room connects ── */
  useEffect(() => { if (connected) updateStatus({ muted, camOff: !camOn }) }, [connected])

  const send    = () => { if (chatInput.trim()) { sendMessage(chatInput.trim()); setChatInput('') } }
  const copyLink= () => { navigator.clipboard.writeText(window.location.href); toast('Link copied!','#7c3aed','📋'); setCopied(true); setTimeout(()=>setCopied(false),2500) }
  const copyCode= () => { navigator.clipboard.writeText(roomData?.code||''); setCopied(true); setTimeout(()=>setCopied(false),2000) }

  /* ── Watch-party state — synced across all room members via useRoom() ── */
  const [watchInput, setWatchInput] = useState('')
  const watchUrl    = watchVideo?.url || null               // truthy ⇒ a video is loaded for everyone
  const watchEmbed  = watchVideo?.kind === 'youtube' ? watchVideo.videoId : null
  const watchDirect = watchVideo?.kind === 'direct'  ? watchVideo.url     : null
  const submitWatch = () => {
    const v = watchInput.trim(); if (!v) return
    setVideo(v); setWatchInput(''); setWatchOpen(false)
    toast('Video loaded! 🎬', '#60a5fa', '📺')
  }
  const stopWatch = () => stopVideo()

  /* ── Media controls: getUserMedia + LiveKit ─────────────────── */
  const doMuteMic = async () => {
    const next = !muted
    setMuted(next)
    if (next) {
      disableMic()
    } else {
      await enableMic(selectedMic)
    }
    lkToggleMic()
    updateStatus({ muted: next })
  }

  const doToggleCam = async () => {
    const next = !camOn
    setCamOn(next)
    if (next) {
      await enableCamera(selectedCam)
    } else {
      disableCamera()
    }
    lkToggleCam()
    updateStatus({ camOff: !next })
  }

  const doToggleScreen = async () => {
    if (!sharing) {
      /* ── START sharing ── */
      try {
        const stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false })
        screenStreamRef.current = stream
        setScreenStream(stream)
        setSharing(true)
        /* auto-stop when user clicks "Stop sharing" in browser chrome */
        stream.getVideoTracks()[0]?.addEventListener('ended', () => {
          screenStreamRef.current = null
          setScreenStream(null)
          setSharing(false)
          if (lkScreen) lkToggleScreen() // unpublish from LiveKit too
        })
        /* publish the SAME captured track to LiveKit — do not let LiveKit
           capture its own copy, that double-prompt is what was silently
           breaking remote delivery */
        if (lkState === 'connected') lkToggleScreen(stream.getVideoTracks()[0])
      } catch (_) {
        /* user cancelled the picker — do nothing */
      }
    } else {
      /* ── STOP sharing ── */
      screenStreamRef.current?.getTracks().forEach(t => t.stop())
      screenStreamRef.current = null
      setScreenStream(null)
      setSharing(false)
      if (lkScreen) lkToggleScreen()
    }
  }

  /* called from DevicePicker "Apply" button */
  const onApplyDevices = async (camId, micId) => {
    setSelectedCam(camId)
    setSelectedMic(micId)
    if (camOn) {
      await enableCamera(camId)
    }
    if (!muted) {
      await enableMic(micId)
    }
    toast('Devices updated ✓', '#22c55e', '🎥')
  }

  /* auto-request permissions as soon as room connects */
  useEffect(() => {
    if (connected && hasPermission === null) {
      requestPermissions()
    }
  }, [connected, hasPermission])

  /* auto-turn-on camera + mic once permission is granted, so the
     user sees their own live video immediately instead of an avatar */
  const autoMediaRef = useRef(false)
  useEffect(() => {
    if (connected && hasPermission === true && !autoMediaRef.current) {
      autoMediaRef.current = true
      ;(async () => {
        setCamOn(true)
        await enableCamera(selectedCam)
        lkToggleCam()
        updateStatus({ camOff: false })
      })()
    }
  }, [connected, hasPermission])

  /* ── Match socket.io members → LiveKit participants ─────────── */
  const lkParticipantMap = {}
  if (lkLocal && selfSocketId) lkParticipantMap[selfSocketId] = lkLocal
  lkRemote.forEach(p => { lkParticipantMap[p.identity] = p })

  const self   = { socketId:selfSocketId, name:user?.firstName||user?.username||'You', avatar:user?.imageUrl, muted, camOff:!camOn, speaking: selfSpeaking }
  const others = members.filter(m=>m.socketId!==selfSocketId)
  const all    = [self, ...others]

  /* ── Screen-share presenter detection ── */
  const remoteScreenSharer = lkRemote.find(
    p => p.getTrackPublication(Track.Source.ScreenShare)?.track
  )
  const isPresenting       = sharing || !!remoteScreenSharer
  const screenSharerName   = sharing
    ? (user?.firstName || user?.username || 'You')
    : (members.find(m => m.socketId === remoteScreenSharer?.identity)?.name || 'Someone')


  /* ── Loading ── */
  if (!connected || !roomData) return (
    <div style={{ height:'100vh', background:'radial-gradient(ellipse at 50% 60%, #0e0a28 0%, #05050f 100%)', display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', fontFamily:'Outfit,sans-serif', gap:20 }}>
      <div style={{ position:'relative' }}>
        <div style={{ position:'absolute', inset:-20, borderRadius:'50%', background:'rgba(124,58,237,.06)', filter:'blur(18px)', animation:'pulse 2s ease-in-out infinite' }} />
        <div style={{ width:72, height:72, borderRadius:'50%', background:'linear-gradient(135deg,rgba(124,58,237,.2),rgba(109,40,217,.08))', border:'1.5px solid rgba(124,58,237,.5)', display:'flex', alignItems:'center', justifyContent:'center', position:'relative', backdropFilter:'blur(12px)' }}>
          <Loader size={28} color="#a78bfa" style={{ animation:'spin 1s linear infinite' }} />
        </div>
      </div>
      <div>
        <div style={{ fontSize:15, color:'white', fontWeight:700, textAlign:'center' }}>Joining room…</div>
        <div style={{ fontSize:12, color:'#4b5563', fontWeight:500, textAlign:'center', marginTop:4 }}>Setting up your connection</div>
      </div>
      <style>{`
        @keyframes spin{to{transform:rotate(360deg)}}
        @keyframes pulse{0%,100%{opacity:.4;transform:scale(1)}50%{opacity:.8;transform:scale(1.1)}}
      `}</style>
    </div>
  )

  return (
    <div style={{ display:'flex', height:'100vh', background:'#050510', fontFamily:'Outfit,sans-serif', color:'white', overflow:'hidden', position:'relative' }}>
      {/* Ambient background lights — purely decorative */}
      <div style={{ position:'fixed', inset:0, pointerEvents:'none', zIndex:0 }}>
        <div style={{ position:'absolute', top:'-10%', left:'20%', width:600, height:600, borderRadius:'50%', background:'radial-gradient(circle, rgba(109,40,217,.07) 0%, transparent 70%)', filter:'blur(40px)' }} />
        <div style={{ position:'absolute', bottom:'-5%', right:'15%', width:500, height:500, borderRadius:'50%', background:'radial-gradient(circle, rgba(59,130,246,.05) 0%, transparent 70%)', filter:'blur(40px)' }} />
        <div style={{ position:'absolute', top:'40%', left:'-5%', width:350, height:350, borderRadius:'50%', background:'radial-gradient(circle, rgba(124,58,237,.04) 0%, transparent 70%)', filter:'blur(30px)' }} />
      </div>
      <style>{`
        @keyframes bPulse    { 0%,100%{transform:scaleY(1)} 50%{transform:scaleY(1.9)} }
        @keyframes sPulse    { 0%,100%{transform:scale(1);opacity:.35} 50%{transform:scale(1.15);opacity:.9} }
        @keyframes wPulse    { 0%,100%{transform:scale(1);opacity:.3} 50%{transform:scale(1.1);opacity:.85} }
        @keyframes toastIn   { from{opacity:0;transform:translateX(110%)} to{opacity:1;transform:translateX(0)} }
        @keyframes spin      { to{transform:rotate(360deg)} }
        @keyframes modalIn   { from{opacity:0;transform:scale(.95) translateY(8px)} to{opacity:1;transform:none} }
        @keyframes chatPop   { from{opacity:0;transform:translateY(18px) scale(.97)} to{opacity:1;transform:none} }
        @keyframes sideIn    { from{opacity:0;transform:translateX(-12px)} to{opacity:1;transform:none} }
        @keyframes shimmer   { 0%{background-position:200% 0} 100%{background-position:-200% 0} }
        @keyframes speakGlow {
          0%,100% { box-shadow: 0 0 0 2px rgba(34,197,94,.35), 0 0 18px rgba(34,197,94,.55), 0 0 40px rgba(34,197,94,.2); }
          50%     { box-shadow: 0 0 0 3px rgba(34,197,94,.6), 0 0 32px rgba(34,197,94,.9), 0 0 70px rgba(34,197,94,.38); }
        }
        ::-webkit-scrollbar       { width:3px }
        ::-webkit-scrollbar-thumb { background:linear-gradient(180deg,rgba(124,58,237,.5),rgba(109,40,217,.3));border-radius:3px }
        ::-webkit-scrollbar-track { background:transparent }
      `}</style>

      {/* ── TOAST STACK ── */}
      <div style={{ position:'fixed', top:76, right:20, zIndex:9999, display:'flex', flexDirection:'column', gap:8, pointerEvents:'none' }}>
        {toasts.map(t => (
          <div key={t.id} style={{ display:'flex', alignItems:'center', gap:10, padding:'11px 16px', borderRadius:16, background:'rgba(8,8,24,.95)', border:`1px solid ${t.color}40`, boxShadow:`0 8px 40px rgba(0,0,0,.65), 0 0 0 1px ${t.color}18`, animation:'toastIn .3s cubic-bezier(.4,0,.2,1) both', minWidth:210, maxWidth:290, backdropFilter:'blur(20px)' }}>
            <div style={{ width:30, height:30, borderRadius:'50%', background:`${t.color}20`, border:`1px solid ${t.color}44`, display:'flex', alignItems:'center', justifyContent:'center', fontSize:14, flexShrink:0 }}>{t.icon}</div>
            <div style={{ fontSize:13, fontWeight:600, color:'white' }}>{t.msg}</div>
          </div>
        ))}
      </div>

      {/* ── SHARE MODAL ── */}
      {shareOpen && <>
        <div onClick={()=>setShareOpen(false)} style={{ position:'fixed', inset:0, zIndex:499, background:'rgba(0,0,0,.65)', backdropFilter:'blur(8px)' }} />
        <div style={{ position:'fixed', top:'50%', left:'50%', transform:'translate(-50%,-50%)', zIndex:500, background:'rgba(8,8,22,.97)', border:'1px solid rgba(124,58,237,.3)', borderRadius:28, padding:30, width:430, boxShadow:'0 40px 120px rgba(0,0,0,.9), 0 0 0 1px rgba(124,58,237,.08), inset 0 1px 0 rgba(255,255,255,.05)', animation:'modalIn .28s cubic-bezier(.4,0,.2,1) both', backdropFilter:'blur(24px)' }}>
          <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:20 }}>
            <div style={{ fontSize:16, fontWeight:800, color:'white' }}>🔗 Invite People</div>
            <button onClick={()=>setShareOpen(false)} style={{ width:28, height:28, borderRadius:'50%', background:'rgba(255,255,255,.08)', border:'none', color:'#9ca3af', cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center' }}>✕</button>
          </div>
          <div style={{ fontSize:12, color:'#6b7280', marginBottom:14 }}>Share this link — anyone with it can join</div>
          <div style={{ display:'flex', background:'rgba(255,255,255,.05)', border:'1px solid rgba(255,255,255,.1)', borderRadius:12, overflow:'hidden', marginBottom:14 }}>
            <div style={{ flex:1, padding:'10px 14px', fontSize:12, color:'#d1d5db', fontFamily:'monospace', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{window.location.href}</div>
            <button onClick={copyLink} style={{ padding:'10px 16px', border:'none', borderLeft:'1px solid rgba(255,255,255,.08)', background:copied?'rgba(34,197,94,.2)':'rgba(124,58,237,.2)', color:copied?'#4ade80':'#a78bfa', fontWeight:700, fontSize:12, cursor:'pointer', whiteSpace:'nowrap' }}>
              {copied ? '✓ Copied!' : '📋 Copy'}
            </button>
          </div>
          <div style={{ display:'flex', alignItems:'center', justifyContent:'center', gap:10, padding:12, borderRadius:12, background:'rgba(255,255,255,.04)', border:'1px solid rgba(255,255,255,.07)' }}>
            <span style={{ fontSize:12, color:'#6b7280' }}>Room code:</span>
            <span style={{ fontSize:22, fontWeight:900, color:'white', letterSpacing:'.2em', fontFamily:'monospace' }}>{roomData.code}</span>
          </div>
        </div>
      </>}

      {/* ══════════════════════════════════════
          LEFT — icon rail + slide panel
      ══════════════════════════════════════ */}

      {/* Dim backdrop when panel open */}
      {sideOpen && (
        <div onClick={()=>setSideOpen(false)}
          style={{ position:'fixed', inset:0, zIndex:299, background:'rgba(0,0,0,.45)', backdropFilter:'blur(3px)' }} />
      )}

      {/* Slide-in panel */}
      <div style={{
        position:'fixed', top:0, left:0, bottom:0, zIndex:300,
        width:224, background:'rgba(6,6,20,.97)',
        borderRight:'1px solid rgba(124,58,237,.15)',
        display:'flex', flexDirection:'column',
        transform: sideOpen ? 'translateX(0)' : 'translateX(-100%)',
        transition:'transform .28s cubic-bezier(.4,0,.2,1)',
        boxShadow: sideOpen ? '12px 0 60px rgba(0,0,0,.7), 1px 0 0 rgba(124,58,237,.1)' : 'none',
        backdropFilter:'blur(24px)',
      }}>
        {/* header */}
        <div style={{ padding:'16px 14px 12px', borderBottom:'1px solid rgba(255,255,255,.06)', display:'flex', alignItems:'center', justifyContent:'space-between' }}>
          <div style={{ display:'flex', alignItems:'center', gap:8 }}>
            <div style={{ width:8, height:8, borderRadius:'50%', background:'#22c55e', boxShadow:'0 0 6px #22c55e' }} />
            <span style={{ fontSize:13, fontWeight:800, color:'white', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', maxWidth:130 }}>{roomData.name}</span>
          </div>
          <button onClick={()=>setSideOpen(false)}
            style={{ width:24, height:24, borderRadius:'50%', background:'rgba(255,255,255,.07)', border:'none', color:'#9ca3af', cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center' }}>
            <X size={11} />
          </button>
        </div>

        {/* room code */}
        <div style={{ padding:'10px 12px', borderBottom:'1px solid rgba(255,255,255,.05)' }}>
          <button onClick={copyCode} style={{ width:'100%', display:'flex', alignItems:'center', gap:7, padding:'8px 11px', borderRadius:10, background:'rgba(124,58,237,.12)', border:'1px solid rgba(124,58,237,.25)', cursor:'pointer' }}>
            <Link size={11} color="#a78bfa" />
            <span style={{ fontSize:11, fontWeight:700, color:'#a78bfa', flex:1, textAlign:'left', letterSpacing:'.06em', fontFamily:'monospace' }}>{roomData.code}</span>
            <span style={{ fontSize:10, color:copied?'#22c55e':'#6b7280' }}>{copied?'✓':'copy'}</span>
          </button>
        </div>

        {/* stats row */}
        <div style={{ display:'flex', gap:6, padding:'8px 12px', borderBottom:'1px solid rgba(255,255,255,.05)' }}>
          <div style={{ flex:1, padding:'6px 8px', borderRadius:9, background:'rgba(34,197,94,.07)', border:'1px solid rgba(34,197,94,.15)', textAlign:'center' }}>
            <div style={{ fontSize:14, color:'#22c55e', fontWeight:800 }}>{all.length}</div>
            <div style={{ fontSize:9, color:'#4b5563' }}>Online</div>
          </div>
          <div style={{ flex:1, padding:'6px 8px', borderRadius:9, background:'rgba(124,58,237,.07)', border:'1px solid rgba(124,58,237,.15)', textAlign:'center' }}>
            <div style={{ fontSize:10, color:'#a78bfa', fontWeight:700, fontFamily:'monospace' }}>{fmt(elapsed)}</div>
            <div style={{ fontSize:9, color:'#4b5563' }}>Time</div>
          </div>
        </div>

        {/* member list */}
        <div style={{ flex:1, overflowY:'auto', padding:'6px 8px' }}>
          <div style={{ fontSize:9, color:'#4b5563', fontWeight:700, letterSpacing:'.09em', textTransform:'uppercase', padding:'4px 8px 8px' }}>
            Members — {all.length}
          </div>
          {all.map(m => (
            <div key={m.socketId} style={{ display:'flex', alignItems:'center', gap:8, padding:'6px 8px', borderRadius:10 }}>
              <img src={AV(m.avatar,26)} style={{ width:26, height:26, borderRadius:'50%', flexShrink:0, border: m.speaking?'1.5px solid #22c55e':'1.5px solid rgba(255,255,255,.1)' }} />
              <div style={{ flex:1, minWidth:0 }}>
                <div style={{ fontSize:12, fontWeight:600, color: m.speaking?'#22c55e':'#d1d5db', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                  {m.socketId===selfSocketId?'You':m.name.split(' ')[0]}
                  {roomData.hostId===m.socketId?' 👑':''}
                </div>
              </div>
              <div style={{ display:'flex', gap:3 }}>
                {m.muted  && <MicOff   size={10} color="#ef4444" />}
                {m.camOff && <VideoOff size={10} color="#f59e0b" />}
              </div>
            </div>
          ))}
        </div>

        {/* self footer */}
        <div style={{ padding:'10px 12px', borderTop:'1px solid rgba(255,255,255,.06)', background:'rgba(0,0,0,.3)', display:'flex', alignItems:'center', gap:8 }}>
          <img src={AV(user?.imageUrl,28)} style={{ width:28, height:28, borderRadius:'50%', border:'1.5px solid rgba(124,58,237,.5)' }} />
          <div style={{ flex:1, minWidth:0 }}>
            <div style={{ fontSize:12, fontWeight:700, color:'white', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{user?.firstName||'You'}</div>
            <div style={{ fontSize:10, color:connected?'#22c55e':'#f59e0b' }}>
            ● {connected?'Connected':'Reconnecting…'}
            {lkState==='connected' && <span style={{ marginLeft:5, color:'#60a5fa' }}>· 🎥 Live</span>}
            {lkState==='connecting' && <span style={{ marginLeft:5, color:'#f59e0b' }}>· Connecting…</span>}
          </div>
          </div>
          <button onClick={doMuteMic}    style={{ background:'none', border:'none', cursor:'pointer', color:muted?'#ef4444':'#9ca3af' }}>{muted?<MicOff size={13}/>:<Mic size={13}/>}</button>
          <button onClick={doToggleCam}  style={{ background:'none', border:'none', cursor:'pointer', color:!camOn?'#ef4444':'#9ca3af' }}>{camOn?<Video size={13}/>:<VideoOff size={13}/>}</button>
        </div>
      </div>

      {/* Thin icon rail (always visible) */}
      <div style={{ width:52, flexShrink:0, background:'#09091c', borderRight:'1px solid rgba(255,255,255,.06)', display:'flex', flexDirection:'column', alignItems:'center', paddingTop:10, gap:6, zIndex:1 }}>
        {/* toggle button */}
        <button onClick={()=>setSideOpen(o=>!o)}
          style={{ width:36, height:36, borderRadius:10, border:'none', background: sideOpen?'rgba(124,58,237,.35)':'rgba(255,255,255,.07)', cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', transition:'all .2s', position:'relative' }}>
          <Users size={16} color={sideOpen?'#a78bfa':'#9ca3af'} />
          {/* online dot */}
          <div style={{ position:'absolute', top:4, right:4, width:7, height:7, borderRadius:'50%', background:'#22c55e', border:'1.5px solid #09091c' }} />
        </button>
        <div style={{ fontSize:9, color:'#4b5563', fontWeight:700 }}>{all.length}</div>

        <div style={{ width:24, height:1, background:'rgba(255,255,255,.07)', margin:'4px 0' }} />

        {/* avatar stack */}
        <div style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:5 }}>
          {all.slice(0,5).map(m => (
            <div key={m.socketId} style={{ position:'relative' }}>
              <img src={AV(m.avatar, 28)} style={{ width:28, height:28, borderRadius:'50%', display:'block', border: m.speaking?'2px solid #22c55e':'2px solid rgba(255,255,255,.08)' }} />
              {m.socketId===selfSocketId && (
                <div style={{ position:'absolute', bottom:-1, right:-1, width:9, height:9, borderRadius:'50%', background:'#7c3aed', border:'1.5px solid #09091c' }} />
              )}
            </div>
          ))}
          {all.length > 5 && (
            <div style={{ fontSize:9, color:'#6b7280', fontWeight:700 }}>+{all.length-5}</div>
          )}
        </div>
      </div>

      {/* ══════════════════════════════════════
          MAIN AREA
      ══════════════════════════════════════ */}
      <div style={{ flex:1, display:'flex', flexDirection:'column', minWidth:0 }}>

        {/* Top bar */}
        <div style={{ height:56, flexShrink:0, display:'flex', alignItems:'center', justifyContent:'space-between', padding:'0 20px', borderBottom:'1px solid rgba(255,255,255,.05)', background:'rgba(5,5,16,.92)', backdropFilter:'blur(24px)', position:'relative', zIndex:10 }}>
          {/* subtle gradient border bottom */}
          <div style={{ position:'absolute', bottom:0, left:0, right:0, height:1, background:'linear-gradient(90deg,transparent,rgba(124,58,237,.3),rgba(59,130,246,.2),transparent)', pointerEvents:'none' }} />
          <div style={{ display:'flex', alignItems:'center', gap:12 }}>
            <div onClick={()=>nav('/home')} style={{ width:36, height:36, borderRadius:12, background:'linear-gradient(135deg,#4f46e5,#7c3aed)', display:'flex', alignItems:'center', justifyContent:'center', fontWeight:900, fontSize:16, cursor:'pointer', flexShrink:0, boxShadow:'0 0 16px rgba(124,58,237,.4), inset 0 1px 0 rgba(255,255,255,.15)' }}>W</div>
            <div>
              <div style={{ fontSize:14, fontWeight:800, color:'white', letterSpacing:'-.01em' }}>{roomData.name}</div>
              <div style={{ fontSize:11, color:'#4b5563', fontWeight:500, display:'flex', alignItems:'center', gap:5 }}>
                <span style={{ color: roomData.isPrivate ? '#f59e0b' : '#6b7280' }}>{roomData.isPrivate ? '🔒' : '🌐'}</span>
                <span>{roomData.isPrivate ? 'Private' : 'Public'}</span>
                <span style={{ color:'#374151' }}>·</span>
                <span>{all.length} {all.length === 1 ? 'person' : 'people'}</span>
                <span style={{ color:'#374151' }}>·</span>
                <span style={{ color:'#9ca3af' }}>{fmt(elapsed)}</span>
              </div>
            </div>
          </div>
          <div style={{ display:'flex', alignItems:'center', gap:10 }}>
            {/* stacked avatars */}
            <div style={{ display:'flex', alignItems:'center' }}>
              {all.slice(0,5).map((m,i) => (
                <img key={m.socketId} src={AV(m.avatar,26)} title={m.name} style={{ width:26, height:26, borderRadius:'50%', border:'2px solid #050510', marginLeft:i?-8:0, boxShadow: m.speaking ? '0 0 8px rgba(34,197,94,.7)' : 'none', transition:'box-shadow .2s' }} />
              ))}
              {all.length > 5 && (
                <div style={{ width:26, height:26, borderRadius:'50%', background:'rgba(124,58,237,.2)', border:'2px solid #050510', marginLeft:-8, display:'flex', alignItems:'center', justifyContent:'center', fontSize:9, fontWeight:800, color:'#a78bfa' }}>+{all.length-5}</div>
              )}
            </div>
            {/* LiveKit status badge */}
            {lkState==='connected' && (
              <div style={{ display:'flex', alignItems:'center', gap:5, padding:'4px 10px', borderRadius:20, background:'rgba(34,197,94,.08)', border:'1px solid rgba(34,197,94,.25)', fontSize:10, color:'#4ade80', fontWeight:700, flexShrink:0 }}>
                <div style={{ width:5, height:5, borderRadius:'50%', background:'#22c55e', boxShadow:'0 0 6px #22c55e', animation:'wPulse 2s ease-in-out infinite' }} />
                Live
              </div>
            )}
            <button onClick={()=>setShareOpen(true)} style={{ display:'flex', alignItems:'center', gap:6, padding:'7px 16px', borderRadius:12, border:'1px solid rgba(124,58,237,.3)', background:'rgba(124,58,237,.1)', color:'#c4b5fd', fontSize:12, fontWeight:700, cursor:'pointer', fontFamily:'Outfit,sans-serif', transition:'all .2s', backdropFilter:'blur(8px)' }}
              onMouseEnter={e=>{ e.currentTarget.style.background='rgba(124,58,237,.22)'; e.currentTarget.style.borderColor='rgba(124,58,237,.6)' }}
              onMouseLeave={e=>{ e.currentTarget.style.background='rgba(124,58,237,.1)'; e.currentTarget.style.borderColor='rgba(124,58,237,.3)' }}>
              <Link size={12}/> Invite
            </button>
          </div>
        </div>

        {/* ══ VOICE + GAMES side by side (no tabs) ══ */}
        <div style={{ flex:1, display:'flex', minHeight:0, overflow:'hidden' }}>

            {/* Left — voice grid / lobby */}
            <div style={{ flex:1, display:'flex', flexDirection:'column', padding:14, gap:12, minWidth:0, overflow:'hidden', background:'radial-gradient(ellipse at 50% 0%, rgba(109,40,217,.04) 0%, transparent 60%)' }}>
              {isPresenting ? (
                /* ─── SCREEN SHARE PRESENTATION MODE ─── */
                <>
                  {/* Main screen share area */}
                  <div style={{
                    flex: 1, position: 'relative', borderRadius: 14,
                    overflow: 'hidden', minHeight: 0,
                    border: '1.5px solid rgba(34,197,94,.3)',
                    boxShadow: '0 0 0 1px rgba(34,197,94,.08), 0 8px 40px rgba(0,0,0,.7)',
                    background: '#000',
                  }}>
                    {/* Video surface */}
                    {sharing ? (
                      screenStream
                        ? <LocalScreenRenderer stream={screenStream} />
                        : <div style={{ width:'100%', height:'100%', display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', gap:14, color:'white' }}>
                            <div style={{ width:60, height:60, borderRadius:'50%', background:'rgba(34,197,94,.12)', border:'1px solid rgba(34,197,94,.3)', display:'flex', alignItems:'center', justifyContent:'center' }}>
                              <MonitorUp size={26} color="#22c55e" />
                            </div>
                            <div style={{ textAlign:'center' }}>
                              <div style={{ fontSize:16, fontWeight:800, marginBottom:4 }}>Broadcasting your screen…</div>
                              <div style={{ fontSize:12, color:'#6b7280' }}>Others in the room can see your screen</div>
                            </div>
                          </div>
                    ) : (
                      remoteScreenSharer
                        ? <ScreenShareRenderer participant={remoteScreenSharer} />
                        : null
                    )}

                    {/* Ambient edge glow */}
                    <div style={{ position:'absolute', inset:0, pointerEvents:'none', background:'radial-gradient(ellipse at top center, rgba(34,197,94,.04) 0%, transparent 65%)' }} />

                    {/* Presenter pill — top left */}
                    <div style={{
                      position:'absolute', top:12, left:12,
                      display:'flex', alignItems:'center', gap:7,
                      padding:'6px 14px', borderRadius:20,
                      background:'rgba(0,0,0,.72)', backdropFilter:'blur(10px)',
                      border:'1px solid rgba(34,197,94,.3)',
                      animation:'chatPop .2s ease both',
                    }}>
                      <div style={{ width:6, height:6, borderRadius:'50%', background:'#22c55e', boxShadow:'0 0 8px #22c55e', flexShrink:0 }} />
                      <MonitorUp size={11} color="#4ade80" />
                      <span style={{ fontSize:12, fontWeight:700, color:'white' }}>
                        {screenSharerName} is sharing
                      </span>
                    </div>

                    {/* Stop button — top right (only for local sharer) */}
                    {sharing && (
                      <button onClick={doToggleScreen} style={{
                        position:'absolute', top:12, right:12,
                        padding:'6px 14px', borderRadius:20,
                        border:'1px solid rgba(239,68,68,.4)',
                        background:'rgba(239,68,68,.18)', backdropFilter:'blur(8px)',
                        color:'#f87171', fontSize:11, fontWeight:700,
                        cursor:'pointer', fontFamily:'Outfit,sans-serif',
                        animation:'chatPop .2s ease both',
                      }}>
                        ✕ Stop Sharing
                      </button>
                    )}
                  </div>

                  {/* Bottom participant tiles strip */}
                  <div style={{
                    height: 118, flexShrink: 0,
                    display: 'flex', gap: 8, paddingTop: 8,
                    overflowX: 'auto', overflowY: 'hidden',
                    alignItems: 'stretch',
                  }}>
                    {all.map(m => (
                      <div key={m.socketId} style={{ aspectRatio:'16/9', height:'100%', flexShrink:0 }}>
                        <Tile
                          member={m}
                          isSelf={m.socketId === selfSocketId}
                          big={false}
                          lkParticipant={lkParticipantMap[m.socketId]}
                          localStream={m.socketId === selfSocketId ? camStream : undefined}
                        />
                      </div>
                    ))}
                  </div>
                </>

              ) : (
                /* ─── DYNAMIC PARTICIPANT GRID — self + others, auto-fits as people join ─── */
                <div style={{ flex:1, position:'relative', minHeight:0 }}>
                  <div style={{
                    position:'absolute', inset:0,
                    display:'grid', gap:10,
                    gridAutoRows: '1fr',
                    gridTemplateColumns:
                      all.length===1 ? '1fr' :
                      all.length===2 ? 'repeat(2,1fr)' :
                      all.length<=4  ? 'repeat(2,1fr)' :
                      all.length<=9  ? 'repeat(3,1fr)' : 'repeat(4,1fr)',
                  }}>
                    {all.map(m => (
                      <Tile
                        key={m.socketId}
                        member={m}
                        isSelf={m.socketId === selfSocketId}
                        big={all.length===1}
                        lkParticipant={lkParticipantMap[m.socketId]}
                        localStream={m.socketId === selfSocketId ? camStream : undefined}
                      />
                    ))}
                  </div>

                  {/* Invite chip — floats top-right, always available */}
                  <div onClick={copyLink} style={{
                    position:'absolute', top:10, right:10, zIndex:5,
                    display:'flex', alignItems:'center', gap:6,
                    padding:'6px 13px', borderRadius:20,
                    background:'rgba(0,0,0,.6)', backdropFilter:'blur(10px)',
                    border:'1px solid rgba(124,58,237,.35)',
                    cursor:'pointer', transition:'all .2s',
                  }}
                  onMouseEnter={e=>{e.currentTarget.style.borderColor='rgba(124,58,237,.8)'}}
                  onMouseLeave={e=>{e.currentTarget.style.borderColor='rgba(124,58,237,.35)'}}>
                    <Users size={12} color={copied?'#4ade80':'#a78bfa'} />
                    <span style={{ fontSize:11, color:copied?'#4ade80':'#a78bfa', fontWeight:700 }}>
                      {copied ? '✓ Copied' : `Invite · ${roomData.code}`}
                    </span>
                  </div>
                </div>
              )}
            </div>

            {/* Right — Games panel (collapsed tab → swipe open) */}
            <div style={{
              width: gamesOpen ? 340 : 36,
              flexShrink: 0,
              borderLeft: '1px solid rgba(255,255,255,.06)',
              display: 'flex',
              flexDirection: 'column',
              background: 'rgba(0,0,0,.18)',
              overflow: 'hidden',
              transition: 'width .28s cubic-bezier(.4,0,.2,1)',
              position: 'relative',
            }}>

              {/* Collapsed tab — always visible, click or swipe right to open */}
              {!gamesOpen && (
                <div
                  onClick={() => setGamesOpen(true)}
                  onTouchStart={e => { e._gx = e.touches[0].clientX }}
                  onTouchEnd={e => { if (e.changedTouches[0].clientX - (e._gx||0) < -30) setGamesOpen(true) }}
                  style={{
                    position: 'absolute', inset: 0,
                    display: 'flex', flexDirection: 'column', alignItems: 'center',
                    justifyContent: 'center', gap: 10, cursor: 'pointer',
                    background: 'rgba(0,0,0,.18)',
                  }}
                  title="Open Games"
                >
                  {/* Arrow chevron */}
                  <div style={{ fontSize: 14, color: '#6b7280', lineHeight: 1 }}>‹</div>
                  {/* Rotated label */}
                  <div style={{
                    writingMode: 'vertical-rl', textOrientation: 'mixed',
                    transform: 'rotate(180deg)',
                    fontSize: 11, fontWeight: 800, color: '#6b7280',
                    letterSpacing: '.08em', textTransform: 'uppercase',
                    display: 'flex', alignItems: 'center', gap: 6,
                  }}>
                    🎮 Games
                  </div>
                  {game && (
                    <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#f59e0b', boxShadow: '0 0 6px #f59e0b' }} />
                  )}
                </div>
              )}

              {/* Expanded panel */}
              {gamesOpen && (
                <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
                  {/* close strip */}
                  <div
                    onClick={() => setGamesOpen(false)}
                    onTouchStart={e => { e._gx = e.touches[0].clientX }}
                    onTouchEnd={e => { if (e.changedTouches[0].clientX - (e._gx||0) > 30) setGamesOpen(false) }}
                    style={{
                      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                      padding: '8px 14px', borderBottom: '1px solid rgba(255,255,255,.06)',
                      cursor: 'pointer', flexShrink: 0, background: 'rgba(0,0,0,.3)',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                      <span style={{ fontSize: 14 }}>🎮</span>
                      <span style={{ fontSize: 12, fontWeight: 800, color: 'white' }}>Games</span>
                      {game && <div style={{ width: 7, height: 7, borderRadius: '50%', background: '#f59e0b', boxShadow: '0 0 5px #f59e0b' }} />}
                    </div>
                    <span style={{ fontSize: 16, color: '#6b7280', lineHeight: 1 }}>›</span>
                  </div>
                  <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
                    <GamesView
                      game={game} members={all} isHost={isHost} selfId={selfSocketId}
                      onStart={startGame} onAction={gameAction} onEnd={endGame}
                    />
                  </div>
                </div>
              )}

            </div>

          </div>

        {/* ── CONTROLS BAR ── */}
        <div style={{ flexShrink:0, display:'flex', flexDirection:'column', borderTop:'1px solid rgba(255,255,255,.05)', background:'rgba(4,4,14,.88)', backdropFilter:'blur(28px)', position:'relative', zIndex:10 }}>
          <div style={{ position:'absolute', top:0, left:0, right:0, height:1, background:'linear-gradient(90deg,transparent,rgba(124,58,237,.25),rgba(59,130,246,.15),transparent)', pointerEvents:'none' }} />

          {/* ── WATCH URL INPUT ROW (slides in when watchOpen) ── */}
          {watchOpen && (
            <div style={{
              padding:'10px 20px', borderBottom:'1px solid rgba(255,255,255,.06)',
              display:'flex', gap:8, alignItems:'center',
              background:'rgba(0,0,0,.3)',
              animation:'chatPop .2s cubic-bezier(.4,0,.2,1) both',
            }}>
              <span style={{ fontSize:16, flexShrink:0 }}>📺</span>
              <div style={{ flex:1, display:'flex', alignItems:'center', gap:8, background:'rgba(255,255,255,.06)', border:`1px solid ${watchUrl?'rgba(34,197,94,.4)':'rgba(255,255,255,.12)'}`, borderRadius:11, padding:'8px 14px', transition:'border .2s' }}>
                <input
                  autoFocus
                  value={watchInput}
                  onChange={e => setWatchInput(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && submitWatch()}
                  placeholder="Paste YouTube or video URL and press Enter…"
                  style={{ flex:1, background:'none', border:'none', outline:'none', color:'white', fontSize:13, fontFamily:'Outfit,sans-serif' }}
                />
                {watchUrl && (
                  <div style={{ display:'flex', alignItems:'center', gap:5, flexShrink:0 }}>
                    <div style={{ width:6, height:6, borderRadius:'50%', background:'#22c55e', boxShadow:'0 0 6px #22c55e' }} />
                    <span style={{ fontSize:10, color:'#4ade80', fontWeight:700 }}>Playing</span>
                  </div>
                )}
              </div>
              <button onClick={submitWatch}
                style={{ padding:'9px 18px', borderRadius:11, border:'none', background:'linear-gradient(135deg,#7c3aed,#6d28d9)', color:'white', fontWeight:700, fontSize:13, cursor:'pointer', fontFamily:'Outfit,sans-serif', flexShrink:0, whiteSpace:'nowrap' }}>
                ▶ Play
              </button>
              {watchUrl && (
                <button onClick={stopWatch}
                  style={{ padding:'9px 14px', borderRadius:11, border:'1px solid rgba(239,68,68,.35)', background:'rgba(239,68,68,.1)', color:'#f87171', fontWeight:700, fontSize:12, cursor:'pointer', fontFamily:'Outfit,sans-serif', flexShrink:0, whiteSpace:'nowrap' }}>
                  ✕ Stop
                </button>
              )}
            </div>
          )}

          {/* ── MAIN BUTTONS ROW ── */}
          <div style={{ height:78, display:'flex', alignItems:'center', justifyContent:'space-between', padding:'0 24px' }}>
          <div style={{ minWidth:160 }}>
            <div style={{ fontSize:13, fontWeight:800, color:'white', letterSpacing:'-.01em' }}>{roomData.name}</div>
            <div style={{ fontSize:11, color:'#374151', fontWeight:500, marginTop:1 }}>{fmt(elapsed)} · {all.length} {all.length===1?'person':'people'}</div>
          </div>

          {/* ── centre pill of controls ── */}
          <div style={{ display:'flex', alignItems:'center', gap:6, background:'rgba(255,255,255,.04)', border:'1px solid rgba(255,255,255,.07)', borderRadius:28, padding:'8px 14px', backdropFilter:'blur(12px)', boxShadow:'0 4px 24px rgba(0,0,0,.4), inset 0 1px 0 rgba(255,255,255,.06)' }}>
            {/* device picker */}
            <div style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:3 }}>
              <button onClick={() => setDeviceOpen(true)} title="Choose Camera & Mic"
                style={{ width:44, height:44, borderRadius:'50%', border:'1px solid rgba(255,255,255,.08)', background: deviceOpen?'rgba(124,58,237,.3)':'rgba(255,255,255,.06)', cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', transition:'all .18s', position:'relative' }}
                onMouseEnter={e=>{e.currentTarget.style.background='rgba(255,255,255,.12)';e.currentTarget.style.borderColor='rgba(255,255,255,.18)'}}
                onMouseLeave={e=>{e.currentTarget.style.background=deviceOpen?'rgba(124,58,237,.3)':'rgba(255,255,255,.06)';e.currentTarget.style.borderColor='rgba(255,255,255,.08)'}}>
                <Settings size={17} color={deviceOpen?'#a78bfa':'#6b7280'} />
                {hasPermission === false && (
                  <div style={{ position:'absolute', top:3, right:3, width:8, height:8, borderRadius:'50%', background:'#ef4444', boxShadow:'0 0 6px #ef4444', border:'1.5px solid #050510' }} />
                )}
              </button>
              <span style={{ fontSize:9, color:'#374151', fontWeight:600, letterSpacing:'.02em' }}>Devices</span>
            </div>
            <div style={{ width:1, height:32, background:'rgba(255,255,255,.06)', flexShrink:0, margin:'0 2px' }} />
            {[
              { label:muted?'Unmute':'Mute',        icon:muted      ?<MicOff    size={18} color="#f87171"/>:<Mic       size={18} color="#e5e7eb"/>, active:muted,     activeColor:'rgba(239,68,68,.22)',  activeBorder:'rgba(239,68,68,.35)',  fn: doMuteMic        },
              { label:camOn?'Stop cam':'Camera',    icon:camOn      ?<Video     size={18} color="#e5e7eb"/> :<VideoOff  size={18} color="#f87171"/>, active:!camOn,    activeColor:'rgba(239,68,68,.22)',  activeBorder:'rgba(239,68,68,.35)',  fn: doToggleCam      },
              { label:sharing?'Stop':'Share',       icon:<MonitorUp  size={18} color={sharing?'#4ade80':'#e5e7eb'}/>,                               active:sharing,   activeColor:'rgba(34,197,94,.2)',   activeBorder:'rgba(34,197,94,.4)',   fn: doToggleScreen   },
              { label:watchUrl?'Now Live':'Watch',  icon:<Tv         size={18} color={watchUrl?'#4ade80':watchOpen?'#60a5fa':'#e5e7eb'}/>,          active:watchUrl||watchOpen, activeColor:watchUrl?'rgba(34,197,94,.2)':'rgba(59,130,246,.2)', activeBorder:watchUrl?'rgba(34,197,94,.4)':'rgba(59,130,246,.4)', fn:()=>setWatchOpen(w=>!w) },
              { label:'React',                      icon:<Smile      size={18} color="#e5e7eb"/>,                                                    active:false,     activeColor:'rgba(255,255,255,.06)', activeBorder:'rgba(255,255,255,.08)', fn:()=>{}            },
              { label:handUp?'Lower':'Hand',        icon:<Hand       size={18} color={handUp?'#fbbf24':'#e5e7eb'}/>,                                active:handUp,    activeColor:'rgba(245,158,11,.2)',   activeBorder:'rgba(245,158,11,.4)',  fn:()=>setHandUp(h=>!h) },
            ].map(btn => (
              <div key={btn.label} style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:3 }}>
                <button onClick={btn.fn} title={btn.label}
                  style={{ width:44, height:44, borderRadius:'50%', border:`1px solid ${btn.active ? btn.activeBorder : 'rgba(255,255,255,.08)'}`, background:btn.active ? btn.activeColor : 'rgba(255,255,255,.06)', cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', transition:'all .18s' }}
                  onMouseEnter={e=>{e.currentTarget.style.background=btn.active?btn.activeColor:'rgba(255,255,255,.12)';e.currentTarget.style.transform='scale(1.06)'}}
                  onMouseLeave={e=>{e.currentTarget.style.background=btn.active?btn.activeColor:'rgba(255,255,255,.06)';e.currentTarget.style.transform='scale(1)'}}>
                  {btn.icon}
                </button>
                <span style={{ fontSize:9, color:'#374151', fontWeight:600, letterSpacing:'.02em' }}>{btn.label}</span>
              </div>
            ))}
          </div>

          {/* right: chat + leave */}
          <div style={{ display:'flex', alignItems:'center', gap:10, minWidth:160, justifyContent:'flex-end' }}>
            {/* Chat */}
            <div style={{ position:'relative' }}>
              <button onClick={()=>setChatOpen(o=>!o)} title="Chat"
                style={{ width:44, height:44, borderRadius:'50%', border:`1px solid ${chatOpen?'rgba(124,58,237,.5)':'rgba(255,255,255,.08)'}`, background: chatOpen?'rgba(124,58,237,.25)':'rgba(255,255,255,.06)', cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', transition:'all .18s' }}
                onMouseEnter={e=>{e.currentTarget.style.background='rgba(255,255,255,.12)'}}
                onMouseLeave={e=>{e.currentTarget.style.background=chatOpen?'rgba(124,58,237,.25)':'rgba(255,255,255,.06)'}}>
                <MessageSquare size={18} color={chatOpen?'#c4b5fd':'#6b7280'} />
              </button>
              {unread > 0 && !chatOpen && (
                <div style={{ position:'absolute', top:-3, right:-3, minWidth:17, height:17, borderRadius:9, background:'linear-gradient(135deg,#ef4444,#dc2626)', border:'2px solid #050510', display:'flex', alignItems:'center', justifyContent:'center', fontSize:9, fontWeight:900, color:'white', padding:'0 3px', boxShadow:'0 0 8px rgba(239,68,68,.5)' }}>
                  {unread > 9 ? '9+' : unread}
                </div>
              )}
            </div>
            {[Settings, MoreHorizontal].map((Icon,i) => (
              <button key={i} style={{ width:44, height:44, borderRadius:'50%', border:'1px solid rgba(255,255,255,.07)', background:'rgba(255,255,255,.04)', cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', transition:'all .18s' }}
                onMouseEnter={e=>e.currentTarget.style.background='rgba(255,255,255,.1)'}
                onMouseLeave={e=>e.currentTarget.style.background='rgba(255,255,255,.04)'}>
                <Icon size={16} color="#4b5563" />
              </button>
            ))}
            {/* Leave */}
            <button onClick={()=>nav('/home')}
              style={{ display:'flex', alignItems:'center', gap:7, padding:'11px 20px', borderRadius:50, border:'1px solid rgba(239,68,68,.35)', background:'rgba(239,68,68,.15)', color:'#f87171', fontWeight:800, fontSize:13, cursor:'pointer', fontFamily:'Outfit,sans-serif', transition:'all .2s', backdropFilter:'blur(8px)' }}
              onMouseEnter={e=>{ e.currentTarget.style.background='rgba(239,68,68,.3)'; e.currentTarget.style.borderColor='rgba(239,68,68,.6)'; e.currentTarget.style.color='#fca5a5' }}
              onMouseLeave={e=>{ e.currentTarget.style.background='rgba(239,68,68,.15)'; e.currentTarget.style.borderColor='rgba(239,68,68,.35)'; e.currentTarget.style.color='#f87171' }}>
              <PhoneOff size={16}/> Leave
            </button>
          </div>
          </div>{/* end buttons row */}
        </div>{/* end controls bar */}
      </div>{/* end main area */}

      {/* ══════════════════════════════════════
          A-FRAME WATCH POPUP
      ══════════════════════════════════════ */}
      {watchUrl && (
        <div style={{
          position:'fixed', bottom:88, right: chatOpen ? 368 : 24, zIndex:402,
          width:520,
          animation:'chatPop .25s cubic-bezier(.4,0,.2,1) both',
          filter:'drop-shadow(0 40px 80px rgba(0,0,0,.85))',
        }}>
          {/* Header */}
          <div style={{
            display:'flex', alignItems:'center', justifyContent:'space-between',
            padding:'9px 14px',
            background:'linear-gradient(to right,#0d0d24,#0e0e2a)',
            border:'1.5px solid rgba(59,130,246,.4)',
            borderBottom:'1px solid rgba(255,255,255,.05)',
            borderRadius:'18px 18px 0 0',
          }}>
            <div style={{ display:'flex', alignItems:'center', gap:7 }}>
              <div style={{ width:7, height:7, borderRadius:'50%', background:'#22c55e', boxShadow:'0 0 7px #22c55e', animation:'speakGlow 2s ease-in-out infinite' }} />
              <Tv size={12} color="#60a5fa" />
              <span style={{ fontSize:12, fontWeight:700, color:'white' }}>Now Playing</span>
            </div>
            <div style={{ display:'flex', gap:6 }}>
              <button onClick={stopWatch}
                style={{ padding:'4px 10px', borderRadius:8, border:'1px solid rgba(239,68,68,.3)', background:'rgba(239,68,68,.1)', color:'#f87171', fontSize:11, fontWeight:700, cursor:'pointer', fontFamily:'Outfit,sans-serif' }}>
                ✕ Stop
              </button>
            </div>
          </div>

          {/* Monitor body */}
          <div style={{
            background:'linear-gradient(160deg,#1a1a2e,#0d0d1c)',
            border:'1.5px solid rgba(59,130,246,.4)',
            borderTop:'none',
            borderBottom:'none',
            padding:'10px 10px 0',
            position:'relative',
          }}>
            {/* Screen */}
            <div style={{
              borderRadius:10, overflow:'hidden', background:'#000',
              aspectRatio:'16/9', position:'relative',
              boxShadow:'inset 0 0 0 1px rgba(255,255,255,.04)',
            }}>
              {/* Scanlines */}
              <div style={{ position:'absolute', inset:0, zIndex:10, pointerEvents:'none', background:'repeating-linear-gradient(0deg,transparent,transparent 3px,rgba(0,0,0,.025) 3px,rgba(0,0,0,.025) 6px)' }} />
              {/* Vignette */}
              <div style={{ position:'absolute', inset:0, zIndex:9, pointerEvents:'none', background:'radial-gradient(ellipse at center,transparent 55%,rgba(0,0,0,.3) 100%)' }} />
              {watchEmbed && (
                <SyncedYouTubePlayer
                  videoId={watchEmbed}
                  watchVideo={watchVideo}
                  onPlay={playVideo}
                  onPause={pauseVideo}
                  onSeek={seekVideo}
                />
              )}
              {watchDirect && (
                <SyncedDirectVideo
                  url={watchDirect}
                  watchVideo={watchVideo}
                  onPlay={playVideo}
                  onPause={pauseVideo}
                  onSeek={seekVideo}
                />
              )}
              {!watchEmbed && !watchDirect && (
                <div style={{ width:'100%', height:'100%', display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', gap:8, color:'#6b7280', position:'relative', zIndex:1 }}>
                  <span style={{ fontSize:32 }}>⚠️</span>
                  <span style={{ fontSize:12 }}>Unsupported format</span>
                </div>
              )}
            </div>
            {/* Bezel label */}
            <div style={{ display:'flex', alignItems:'center', justifyContent:'center', gap:8, padding:'7px 0 5px' }}>
              <div style={{ width:20, height:1.5, borderRadius:1, background:'rgba(255,255,255,.06)' }} />
              <span style={{ fontSize:7, color:'rgba(255,255,255,.14)', letterSpacing:'.3em', fontWeight:700 }}>WATCHYME · DISPLAY</span>
              <div style={{ width:20, height:1.5, borderRadius:1, background:'rgba(255,255,255,.06)' }} />
            </div>
          </div>

          {/* A-frame stand */}
          <div style={{
            height:46, position:'relative',
            background:'linear-gradient(to bottom,#0d0d1c,transparent)',
            border:'1.5px solid rgba(59,130,246,.4)', borderTop:'none',
            borderRadius:'0 0 4px 4px',
          }}>
            {/* Neck */}
            <div style={{ position:'absolute', top:0, left:'50%', transform:'translateX(-50%)', width:38, height:18, background:'linear-gradient(to bottom,#171728,#0f0f1e)', clipPath:'polygon(18% 0%,82% 0%,100% 100%,0% 100%)' }} />
            {/* Left leg */}
            <div style={{ position:'absolute', top:16, left:'50%', marginLeft:-18, width:6, height:28, borderRadius:'2px 2px 3px 3px', background:'linear-gradient(to right,#1c1c30,#10101e)', transform:'rotate(-26deg)', transformOrigin:'top center', boxShadow:'inset 1px 0 0 rgba(255,255,255,.07)' }} />
            {/* Right leg */}
            <div style={{ position:'absolute', top:16, right:'50%', marginRight:-18, width:6, height:28, borderRadius:'2px 2px 3px 3px', background:'linear-gradient(to left,#1c1c30,#10101e)', transform:'rotate(26deg)', transformOrigin:'top center', boxShadow:'inset -1px 0 0 rgba(255,255,255,.07)' }} />
            {/* Crossbar */}
            <div style={{ position:'absolute', top:28, left:'50%', transform:'translateX(-50%)', width:62, height:4, borderRadius:2, background:'linear-gradient(to right,transparent,rgba(255,255,255,.08),transparent)' }} />
            {/* Left foot */}
            <div style={{ position:'absolute', bottom:4, left:'50%', marginLeft:-56, width:28, height:3, borderRadius:2, background:'rgba(255,255,255,.05)' }} />
            {/* Right foot */}
            <div style={{ position:'absolute', bottom:4, right:'50%', marginRight:-56, width:28, height:3, borderRadius:2, background:'rgba(255,255,255,.05)' }} />
            {/* Floor glow */}
            <div style={{ position:'absolute', bottom:0, left:'50%', transform:'translateX(-50%)', width:160, height:10, background:'radial-gradient(ellipse,rgba(59,130,246,.18) 0%,transparent 70%)', filter:'blur(6px)' }} />
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════
          DEVICE PICKER MODAL
      ══════════════════════════════════════ */}
      <DevicePicker
        open={deviceOpen}
        onClose={() => setDeviceOpen(false)}
        devices={devices}
        selectedCam={selectedCam}
        setSelectedCam={setSelectedCam}
        selectedMic={selectedMic}
        setSelectedMic={setSelectedMic}
        hasPermission={hasPermission}
        requestPermissions={requestPermissions}
        onApply={onApplyDevices}
      />

      {/* ══════════════════════════════════════
          FLOATING CHAT POPUP
      ══════════════════════════════════════ */}
      {chatOpen && (
        <div style={{
          position:'fixed', bottom:90, right:24, zIndex:400,
          width:320, height:480,
          background:'#0d0d24', border:'1px solid rgba(124,58,237,.3)',
          borderRadius:20, display:'flex', flexDirection:'column',
          boxShadow:'0 24px 80px rgba(0,0,0,.75)',
          animation:'chatPop .22s cubic-bezier(.4,0,.2,1) both',
          overflow:'hidden',
        }}>
          {/* header */}
          <div style={{ padding:'13px 16px', borderBottom:'1px solid rgba(255,255,255,.07)', display:'flex', alignItems:'center', justifyContent:'space-between', flexShrink:0, background:'rgba(0,0,0,.3)' }}>
            <div style={{ display:'flex', alignItems:'center', gap:8 }}>
              <MessageSquare size={14} color="#a78bfa" />
              <span style={{ fontSize:13, fontWeight:700, color:'white' }}>Room Chat</span>
              <div style={{ display:'flex', alignItems:'center', gap:4, fontSize:10, color:'#22c55e', marginLeft:4 }}>
                <div style={{ width:5, height:5, borderRadius:'50%', background:'#22c55e' }} />
                {all.length}
              </div>
            </div>
            <button onClick={()=>setChatOpen(false)}
              style={{ width:26, height:26, borderRadius:'50%', background:'rgba(255,255,255,.07)', border:'none', color:'#9ca3af', cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center' }}>
              <X size={12} />
            </button>
          </div>

          {/* messages */}
          <div style={{ flex:1, overflowY:'auto', padding:'12px 14px', display:'flex', flexDirection:'column', gap:12 }}>
            {messages.length === 0 && (
              <div style={{ textAlign:'center', paddingTop:40, color:'#4b5563', fontSize:13 }}>No messages yet 👋</div>
            )}
            {messages.map(m => (
              <div key={m.id} style={{ display:'flex', gap:9, alignItems:'flex-start' }}>
                <img src={AV(m.avatar, 28)} style={{ width:28, height:28, borderRadius:'50%', flexShrink:0, marginTop:1 }} />
                <div style={{ flex:1, minWidth:0 }}>
                  <div style={{ display:'flex', alignItems:'baseline', gap:6, marginBottom:2 }}>
                    <span style={{ fontSize:12, fontWeight:700, color: m.isSystem?'#6b7280':'white' }}>{(m.name||'?').split(' ')[0]}</span>
                    <span style={{ fontSize:10, color:'#374151' }}>{new Date(m.time||Date.now()).toLocaleTimeString('en',{hour:'2-digit',minute:'2-digit'})}</span>
                  </div>
                  <p style={{ fontSize:12, color: m.isSystem?'#6b7280':'#d1d5db', margin:0, lineHeight:1.55, wordBreak:'break-word', fontStyle:m.isSystem?'italic':'normal' }}>{m.text}</p>
                  {m.reactions?.length > 0 && (
                    <div style={{ display:'flex', gap:4, marginTop:4, flexWrap:'wrap' }}>
                      {m.reactions.map((r,i) => (
                        <span key={i} style={{ fontSize:11, padding:'2px 7px', borderRadius:8, background:'rgba(124,58,237,.15)', border:'1px solid rgba(124,58,237,.25)', color:'#d1d5db', cursor:'pointer' }}>{r.e} {r.n}</span>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ))}
            <div ref={chatEnd} />
          </div>

          {/* input */}
          <div style={{ padding:'10px 12px', borderTop:'1px solid rgba(255,255,255,.07)', flexShrink:0 }}>
            <div style={{ display:'flex', alignItems:'center', gap:8, background:'rgba(255,255,255,.06)', border:'1px solid rgba(255,255,255,.1)', borderRadius:12, padding:'9px 12px' }}>
              <input
                autoFocus
                value={chatInput}
                onChange={e => setChatInput(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && send()}
                placeholder="Message the room…"
                style={{ flex:1, background:'none', border:'none', outline:'none', color:'white', fontSize:13, fontFamily:'Outfit,sans-serif' }}
              />
              <button onClick={send} style={{ width:28, height:28, borderRadius:8, border:'none', background:'#7c3aed', display:'flex', alignItems:'center', justifyContent:'center', cursor:'pointer', flexShrink:0 }}>
                <Send size={12} color="white" />
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
