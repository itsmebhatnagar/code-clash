import { io } from 'socket.io-client'
import { BACKEND_ORIGIN } from './backendUrl'

export const SOCKET_URL = BACKEND_ORIGIN

export function connectSocket(token: string) {
  return io(SOCKET_URL, { auth: { token } })
}
