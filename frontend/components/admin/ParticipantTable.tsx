import type { Participant } from '../../lib/types'

export function ParticipantTable({ participants }: { participants: Participant[] }) {
  if (participants.length === 0) return <p className="empty-roster">Waiting for participant registrations...</p>
  return <div className="participant-list">{participants.map((participant) => <div className="participant-row" key={participant.id}><strong>{participant.name}</strong><span>{participant.email}</span><span>{participant.collegeId || '—'}</span><span>{participant.college || '—'}</span><b>{participant.status}</b></div>)}</div>
}
