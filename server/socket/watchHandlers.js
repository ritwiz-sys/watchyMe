/* ─────────────────────────────────────────────────────────────
   Watch Party sync — keeps video in sync across all room members
   Works with any YouTube videoId
───────────────────────────────────────────────────────────── */
import { getRoom } from '../state/rooms.js'
import { log } from '../utils/logger.js'

// extract a YouTube videoId from any common URL shape
function parseYouTubeId(url) {
  const m = url.match(/(?:youtube\.com\/(?:watch\?v=|embed\/|shorts\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/)
  return m ? m[1] : null
}

export function registerWatchHandlers(io, socket) {

  /* ── SET VIDEO ────────────────────────────────────────────── */
  // accepts either { url } (preferred — derives kind/videoId here) or
  // a legacy { videoId } for backwards compatibility
  socket.on('setVideo', ({ url, videoId }, cb) => {
    const room = getRoom(socket.data.roomId)
    if (!room) return cb?.({ ok: false, error: 'Not in a room' })

    let watchVideo = null
    if (url) {
      const ytId = parseYouTubeId(url)
      if (ytId) {
        watchVideo = { kind: 'youtube', videoId: ytId, url, playing: false, currentTime: 0, updatedAt: Date.now() }
      } else if (/\.(mp4|webm|ogg)$/i.test(url)) {
        watchVideo = { kind: 'direct', videoId: null, url, playing: false, currentTime: 0, updatedAt: Date.now() }
      } else {
        return cb?.({ ok: false, error: 'Unsupported video link' })
      }
    } else if (videoId) {
      watchVideo = { kind: 'youtube', videoId, url: null, playing: false, currentTime: 0, updatedAt: Date.now() }
    } else {
      return cb?.({ ok: false, error: 'No url or videoId provided' })
    }

    room.watchVideo = watchVideo
    io.to(room.id).emit('videoChanged', room.watchVideo)

    const name = socket.data.member?.name || 'Someone'
    log.room(`${name} set video (${watchVideo.kind}) in ${room.code}`)
    cb?.({ ok: true })
  })

  /* ── STOP VIDEO ───────────────────────────────────────────── */
  socket.on('stopVideo', (cb) => {
    const room = getRoom(socket.data.roomId)
    if (!room) return cb?.({ ok: false, error: 'Not in a room' })

    room.watchVideo = null
    io.to(room.id).emit('videoChanged', null)
    cb?.({ ok: true })
  })

  /* ── PLAY ─────────────────────────────────────────────────── */
  socket.on('playVideo', ({ currentTime }, cb) => {
    const room = getRoom(socket.data.roomId)
    if (!room?.watchVideo) return cb?.({ ok: false, error: 'No video set' })

    room.watchVideo.playing     = true
    room.watchVideo.currentTime = currentTime ?? room.watchVideo.currentTime
    room.watchVideo.updatedAt   = Date.now()

    // broadcast to others (not sender — their player already played)
    socket.to(room.id).emit('videoPlay', { currentTime: room.watchVideo.currentTime })
    cb?.({ ok: true })
  })

  /* ── PAUSE ────────────────────────────────────────────────── */
  socket.on('pauseVideo', ({ currentTime }, cb) => {
    const room = getRoom(socket.data.roomId)
    if (!room?.watchVideo) return cb?.({ ok: false, error: 'No video set' })

    room.watchVideo.playing     = false
    room.watchVideo.currentTime = currentTime ?? room.watchVideo.currentTime
    room.watchVideo.updatedAt   = Date.now()

    socket.to(room.id).emit('videoPause', { currentTime: room.watchVideo.currentTime })
    cb?.({ ok: true })
  })

  /* ── SEEK ─────────────────────────────────────────────────── */
  socket.on('seekVideo', ({ currentTime }, cb) => {
    const room = getRoom(socket.data.roomId)
    if (!room?.watchVideo) return cb?.({ ok: false, error: 'No video set' })

    room.watchVideo.currentTime = currentTime
    room.watchVideo.updatedAt   = Date.now()

    socket.to(room.id).emit('videoSeek', { currentTime })
    cb?.({ ok: true })
  })

  /* ── SYNC REQUEST (late joiner / drift correction) ────────── */
  // Client emits this when it wants to know the current server state
  socket.on('syncRequest', (cb) => {
    const room = getRoom(socket.data.roomId)
    if (!room?.watchVideo) return cb?.({ ok: true, watchVideo: null })

    // estimate currentTime accounting for elapsed time since last update
    const elapsed = (Date.now() - room.watchVideo.updatedAt) / 1000
    const estimated = room.watchVideo.playing
      ? room.watchVideo.currentTime + elapsed
      : room.watchVideo.currentTime

    cb?.({ ok: true, watchVideo: { ...room.watchVideo, currentTime: estimated } })
  })
}
