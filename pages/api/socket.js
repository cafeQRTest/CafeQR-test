// pages/api/socket.js
import { Server } from 'socket.io'

export const config = { api: { bodyParser: false } }

export default function handler(req, res) {
  if (!res.socket.server.io) {
    const io = new Server(res.socket.server, {
      cors: { origin: '*', methods: ['GET', 'POST'] },
    })

    io.on('connection', (socket) => {
      socket.on('subscribeToNotifications', ({ restaurantId }) => {
        if (!restaurantId) return
        socket.join(`rid:${restaurantId}`)
      })
      socket.on('unsubscribeNotifications', ({ restaurantId }) => {
        if (!restaurantId) return
        socket.leave(`rid:${restaurantId}`)
      })
    })

    res.socket.server.io = io
  }
  res.end()
}
