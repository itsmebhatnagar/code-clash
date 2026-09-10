'use client'

import { LogOut, ShieldCheck } from 'lucide-react'
import { useAdminParticipants } from '../../hooks/useAdminParticipants'
import { useAdminMetrics } from '../../hooks/useAdminMetrics'
import type { User } from '../../lib/types'
import { Metrics } from './Metrics'
import { ParticipantTable } from './ParticipantTable'

export function AdminPanel({ user, token, onLogout }: { user: User; token: string; onLogout: () => void }) {
  const participants = useAdminParticipants(token)
  const metrics = useAdminMetrics(token)
  return <main className="dashboard-shell"><DashboardHeader user={user} onLogout={onLogout} /><Metrics metrics={metrics} /><section className="dashboard-card participant-roster"><div className="roster-heading"><ShieldCheck size={22} /><div><div className="form-kicker">REGISTERED PARTICIPANT ROSTER</div><h2>New signups appear automatically</h2></div></div><ParticipantTable participants={participants} /></section></main>
}

function DashboardHeader({ user, onLogout }: { user: User; onLogout: () => void }) {
  return <header className="dashboard-header"><div><div className="form-kicker">CODE CLASH // COMMAND DECK</div><h1>Welcome aboard, {user.name}.</h1><p>Your authenticated contest station is ready.</p></div><button className="outline-button" onClick={onLogout}><LogOut size={15} /> SIGN OUT</button></header>
}
