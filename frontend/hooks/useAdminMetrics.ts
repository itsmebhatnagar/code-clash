'use client'

import { useEffect, useState } from 'react'
import { getAdminMetrics } from '../lib/api'
import { connectSocket } from '../lib/socket'
import type { AdminMetrics } from '../lib/types'

const emptyMetrics: AdminMetrics = { totalParticipants: 0, registered: 0, checkedIn: 0, active: 0, completed: 0, connected: 0, inContest: 0, submitted: 0, disconnected: 0, currentRound: null, liveContestStatus: 'UNKNOWN', countdownSeconds: 0 }

export function useAdminMetrics(token: string) {
  const [metrics, setMetrics] = useState<AdminMetrics>(emptyMetrics)
  useEffect(() => {
    getAdminMetrics(token).then(setMetrics)
    const socket = connectSocket(token)
    socket.on('ADMIN_METRICS_UPDATE', (nextMetrics: AdminMetrics) => setMetrics(nextMetrics))
    return () => { socket.disconnect() }
  }, [token])
  return metrics
}
