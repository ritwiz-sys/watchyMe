import { Server } from 'socket.io'
import { registerRoomHandlers } from './roomHandlers.js'
import { registerChatHandlers } from './chatHandlers.js'
import { registerGameHandlers } from './gameHandlers.js'
import { registerWatchHandlers } from './watchHandlers.js'
import { registerRtcHandlers }   from './rtcHandlers.js'
import { registerPresenceHandlers }  from './presenceHandlers.js'
import { registerFriendHandlers }    from './friendHandlers.js'
import { registerCommunityHandlers } from './communityHandlers.js'
import { log } from '../utils/logger.js'

export function initSocket(httpServer, clientUrl) {
  const io = new Server(httpServer, {
    cors: { origin: clientUrl, methods: ['GET', 'POST'] },
    pingInterval: 25_000,
    pingTimeout:  20_000,
  })

  // ── auth middleware (optional — attaches Clerk userId if present) ──
  io.use((socket, next) => {
    const token = socket.handshake.auth?.token
    // TODO: verify Clerk JWT here when ready
    socket.data.userId = token || socket.id
    next()
  })

  io.on('connection', (socket) => {
    log.sock(`+ ${socket.id}  (${io.engine.clientsCount} connected)`)

    // register all handlers
    registerRoomHandlers(io, socket)
    registerChatHandlers(io, socket)
    registerGameHandlers(io, socket)
    registerWatchHandlers(io, socket)
    registerRtcHandlers(io, socket)
    registerPresenceHandlers(io, socket)
    registerFriendHandlers(io, socket)
    registerCommunityHandlers(io, socket)

    socket.on('disconnect', (reason) => {
      log.sock(`- ${socket.id}  reason: ${reason}`)
    })
  })

  return io
}
