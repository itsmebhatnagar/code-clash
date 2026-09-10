'use client'

import { useEffect } from 'react'
import { connectSocket } from '../lib/socket'

export function useContestSocket<T>(token: string | null, event: string, onEvent: (data: T) => void) {
  useEffect(() => {
    if (!token) return
    const socket = connectSocket(token)
    socket.on(event, onEvent)
    return () => { socket.disconnect() }
  }, [event, onEvent, token])
}
