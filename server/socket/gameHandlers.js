import { getRoom } from '../state/rooms.js'
import { buildGame, applyAction, forceAdvanceTrivia, advanceDrawRound } from '../game/logic.js'
import { log } from '../utils/logger.js'
import { saveGameResult } from '../firebase/db.js'

const TRIVIA_TIMER_MS = 17_000   // 15s question + 2s grace
const DRAW_TURN_MS    = 60_000   // 60s drawing turn
const DRAW_REVEAL_MS  =  5_000   // 5s reveal before next turn

export function registerGameHandlers(io, socket) {

  /* ── START GAME ──────────────────────────────────────────── */
  socket.on('startGame', ({ type }, cb) => {
    try {
      const room = getRoom(socket.data.roomId)
      if (!room)                     return cb?.({ ok: false, error: 'Not in a room' })
      if (room.hostId !== socket.id) return cb?.({ ok: false, error: 'Only host can start' })
      if (room.members.size < 1)     return cb?.({ ok: false, error: 'Need at least 1 player' })

      const playerIds = [...room.members.keys()]
      const game      = buildGame(type, playerIds)
      room.game       = game

      if (type === 'trivia') scheduleTriviaTimer(io, room)
      if (type === 'draw')   scheduleDrawTimer(io, room)

      io.to(room.id).emit('gameStarted', serialiseGame(game))
      log.game(`${type} started in ${room.code}  (${playerIds.length} players)`)
      cb?.({ ok: true, game: serialiseGame(game) })
    } catch (e) {
      log.error('startGame', e.message)
      cb?.({ ok: false, error: 'Server error' })
    }
  })

  /* ── GAME ACTION ─────────────────────────────────────────── */
  socket.on('gameAction', (payload, cb) => {
    try {
      const room = getRoom(socket.data.roomId)
      if (!room?.game) return cb?.({ ok: false, error: 'No active game' })

      // Inject player name for draw guesses
      if (room.game.type === 'draw' && payload.guess !== undefined) {
        payload.playerName = socket.data.member?.name || socket.id
      }

      const result = applyAction(room.game, socket.id, payload)
      if (!result.ok) return cb?.({ ok: false, error: result.error })

      const sg = serialiseGame(room.game)
      io.to(room.id).emit('gameUpdated', sg)

      if (room.game.phase === 'results') {
        io.to(room.id).emit('gameEnded', sg)
        saveGameResult(room.id, room.game)
        log.game(`ended in ${room.code}`)
      }

      // Draw: all guessed correctly → advance immediately
      if (room.game.type === 'draw' && room.game.phase === 'reveal') {
        advanceDrawAfterReveal(io, room)
      }

      cb?.({ ok: true, game: sg })
    } catch (e) {
      log.error('gameAction', e.message)
      cb?.({ ok: false, error: 'Server error' })
    }
  })

  /* ── DRAW EVENTS (relay strokes to room) ─────────────────── */
  socket.on('drawEvent', (payload) => {
    const room = getRoom(socket.data.roomId)
    if (!room) return
    socket.to(room.id).emit('drawEvent', payload)
  })

  socket.on('clearCanvas', () => {
    const room = getRoom(socket.data.roomId)
    if (!room) return
    socket.to(room.id).emit('clearCanvas')
  })

  /* ── END GAME (host) ─────────────────────────────────────── */
  socket.on('endGame', (cb) => {
    const room = getRoom(socket.data.roomId)
    if (!room)                     return cb?.({ ok: false, error: 'Not in a room' })
    if (room.hostId !== socket.id) return cb?.({ ok: false, error: 'Only host can end' })

    room.game = null
    io.to(room.id).emit('gameStopped')
    log.game(`stopped in ${room.code}`)
    cb?.({ ok: true })
  })

  /* ── GET SCORES ──────────────────────────────────────────── */
  socket.on('getScores', (cb) => {
    const room = getRoom(socket.data.roomId)
    if (!room?.game) return cb?.({ ok: false, error: 'No active game' })
    cb?.({ ok: true, scores: room.game.scores })
  })
}

/* ── Trivia auto-advance timer ──────────────────────────────── */
function scheduleTriviaTimer(io, room) {
  const game = room.game
  if (!game || game.type !== 'trivia' || game.phase === 'results') return

  setTimeout(() => {
    const g = room.game
    if (!g || g.type !== 'trivia' || g.phase !== 'question') return

    forceAdvanceTrivia(g)
    const sg = serialiseGame(g)
    io.to(room.id).emit('gameUpdated', sg)

    if (g.phase === 'results') {
      io.to(room.id).emit('gameEnded', sg)
    } else {
      scheduleTriviaTimer(io, room)
    }
  }, TRIVIA_TIMER_MS)
}

/* ── Draw turn timer (countdown every second) ───────────────── */
function scheduleDrawTimer(io, room) {
  const game = room.game
  if (!game || game.type !== 'draw') return

  const tick = setInterval(() => {
    const g = room.game
    if (!g || g.type !== 'draw' || g.phase !== 'drawing') {
      clearInterval(tick)
      return
    }
    g.timeLeft = Math.max(0, g.timeLeft - 1)
    io.to(room.id).emit('gameUpdated', serialiseGame(g))

    if (g.timeLeft <= 0) {
      clearInterval(tick)
      g.phase = 'reveal'
      io.to(room.id).emit('gameUpdated', serialiseGame(g))
      io.to(room.id).emit('clearCanvas')
      advanceDrawAfterReveal(io, room)
    }
  }, 1000)
}

function advanceDrawAfterReveal(io, room) {
  setTimeout(() => {
    const g = room.game
    if (!g || g.type !== 'draw') return

    advanceDrawRound(g)
    const sg = serialiseGame(g)
    io.to(room.id).emit('gameUpdated', sg)
    io.to(room.id).emit('clearCanvas')

    if (g.phase === 'results') {
      io.to(room.id).emit('gameEnded', sg)
      saveGameResult(room.id, g)
      log.game(`draw ended in ${room.code}`)
    } else {
      scheduleDrawTimer(io, room)
    }
  }, DRAW_REVEAL_MS)
}

/* ── Serialise game (Set → Array for JSON) ───────────────────── */
function serialiseGame(game) {
  if (!game) return null
  const out = { ...game }
  if (out.used instanceof Set) out.used = [...out.used]
  if (out.correctGuessers instanceof Set) out.correctGuessers = [...out.correctGuessers]
  return out
}
