'use client'

import { useCallback, useEffect, useState } from 'react'
import { getAdminMetrics } from '../lib/api'
import { connectSocket } from '../lib/socket'
import type { AdminMetrics } from '../lib/types'

const emptyMetrics: AdminMetrics = { totalParticipants: 0, registered: 0, checkedIn: 0, active: 0, completed: 0, disqualified: 0, connected: 0, inContest: 0, submitted: 0, acceptedSolutions: 0, disconnected: 0, currentRound: null, currentRoundId: null, liveContestStatus: 'UNKNOWN', countdownSeconds: 0 }

export function useAdminMetrics(token: string) {
  const [metrics, setMetrics] = useState<AdminMetrics>(emptyMetrics)
  const refresh = useCallback(() => { void getAdminMetrics(token).then(setMetrics) }, [token])
  useEffect(() => {
    refresh()
    const socket = connectSocket(token)
    socket.on('ADMIN_METRICS_UPDATE', (nextMetrics: AdminMetrics) => setMetrics(nextMetrics))
    socket.on('ROUND_STATE_UPDATE', refresh)
    return () => { socket.disconnect() }
  }, [refresh, token])
  return metrics
}
