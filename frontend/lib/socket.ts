import { io } from 'socket.io-client'

export const SOCKET_URL = 'http://localhost:5000'

export function connectSocket(token: string) {
  return io(SOCKET_URL, { auth: { token } })
}
