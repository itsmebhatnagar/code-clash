'use client'

import { useEffect } from 'react'
import { connectSocket } from '../lib/socket'

export function useActivityPing(token: string) {
  useEffect(() => {
    const socket = connectSocket(token)
    
    const pingInterval = setInterval(() => {
      socket.emit('ACTIVITY_PING')
    }, 30_000)

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        socket.emit('ACTIVITY_PING')
      }
    }

    document.addEventListener('visibilitychange', handleVisibilityChange)

    return () => {
      clearInterval(pingInterval)
      document.removeEventListener('visibilitychange', handleVisibilityChange)
      socket.disconnect()
    }
  }, [token])
}
