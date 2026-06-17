import { io } from 'socket.io-client'

const socket = io(import.meta.env.VITE_SERVER_URL || 'http://localhost:4000')

export default socket
