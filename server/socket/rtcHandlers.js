/* ─────────────────────────────────────────────────────────────
   WebRTC signaling — forwards offers/answers/ICE between peers
   The server never touches media; it only relays SDP + candidates
───────────────────────────────────────────────────────────── */
import { getRoom, getMember } from '../state/rooms.js'
import { log } from '../utils/logger.js'

export function registerRtcHandlers(io, socket) {

  /* ── OFFER (caller → callee) ──────────────────────────────── */
  socket.on('rtcOffer', ({ to, offer }) => {
    if (!validateTarget(socket, to)) return
    io.to(to).emit('rtcOffer', { from: socket.id, offer })
  })

  /* ── ANSWER (callee → caller) ─────────────────────────────── */
  socket.on('rtcAnswer', ({ to, answer }) => {
    if (!validateTarget(socket, to)) return
    io.to(to).emit('rtcAnswer', { from: socket.id, answer })
  })

  /* ── ICE CANDIDATE ────────────────────────────────────────── */
  socket.on('rtcIceCandidate', ({ to, candidate }) => {
    if (!validateTarget(socket, to)) return
    io.to(to).emit('rtcIceCandidate', { from: socket.id, candidate })
  })

  /* ── REQUEST ALL PEERS (new joiner triggers mesh setup) ────── */
  // New peer asks existing peers to send them an offer
  socket.on('rtcRequestPeers', () => {
    const room = getRoom(socket.data.roomId)
    if (!room) return

    // Tell every existing member to initiate an offer to the new peer
    socket.to(room.id).emit('rtcInitiateOffer', { to: socket.id })
    log.sock(`${socket.id} requested peer offers in ${room.code}`)
  })
}

/* ── guard: target must be in same room ──────────────────────── */
function validateTarget(socket, targetId) {
  const room = getRoom(socket.data.roomId)
  if (!room) return false
  if (!getMember(room, targetId)) return false
  return true
}
