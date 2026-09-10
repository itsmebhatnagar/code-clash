'use client'

import { useCallback, useEffect, useState } from 'react'
import { getParticipants } from '../lib/api'
import { connectSocket } from '../lib/socket'
import type { Participant } from '../lib/types'

export function useAdminParticipants(token: string) {
  const [participants, setParticipants] = useState<Participant[]>([])
  const addParticipants = useCallback((incoming: Participant[]) => {
    setParticipants((current) => {
      const byId = new Map(current.map((participant) => [participant.id, participant]))
      incoming.forEach((participant) => byId.set(participant.id, participant))
      return Array.from(byId.values())
    })
  }, [])

  useEffect(() => {
    getParticipants(token).then(addParticipants)
    const socket = connectSocket(token)
    socket.on('PARTICIPANT_REGISTERED', (participant: Participant) => addParticipants([participant]))
    return () => { socket.disconnect() }
  }, [addParticipants, token])

  return participants
}
