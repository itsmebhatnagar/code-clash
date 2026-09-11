'use client'

import { useCallback, useEffect, useState } from 'react'
import { getParticipantDashboard } from '../lib/api'
import { connectSocket } from '../lib/socket'
import type { ParticipantDashboard } from '../lib/types'

export function useParticipantDashboard(token: string) {
  const [dashboard, setDashboard] = useState<ParticipantDashboard>({ round: null })
  const refresh = useCallback(() => { void getParticipantDashboard(token).then(setDashboard) }, [token])

  useEffect(() => {
    refresh()
    const socket = connectSocket(token)
    socket.on('ROUND_STATE_UPDATE', refresh)
    return () => { socket.disconnect() }
  }, [refresh, token])

  return { dashboard, refresh }
}