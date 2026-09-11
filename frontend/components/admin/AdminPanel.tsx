'use client'

import { LogOut, Pause, Play, ShieldCheck, Square } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useAdminParticipants } from '../../hooks/useAdminParticipants'
import { useAdminMetrics } from '../../hooks/useAdminMetrics'
import { adminFetch } from '../../lib/api'
import { connectSocket } from '../../lib/socket'
import type { AdminRound, User } from '../../lib/types'
import { Metrics } from './Metrics'
import { ParticipantTable } from './ParticipantTable'
import { AdminControlCenter } from './AdminControlCenter'

export function AdminPanel({ user, token, onLogout }: { user: User; token: string; onLogout: () => void }) {
  const participants = useAdminParticipants(token)
  const metrics = useAdminMetrics(token)
  const [rounds, setRounds] = useState<AdminRound[]>([])
  const [selectedTab, setSelectedTab] = useState<'operations' | 'contest' | 'review' | 'system'>('operations')

  useEffect(() => {
    void adminFetch<AdminRound[]>(token, '/rounds').then(({ data }) => setRounds(data || []))
  }, [token, metrics.liveContestStatus])

  function changeRound(action: 'START_ROUND' | 'PAUSE_ROUND' | 'RESUME_ROUND' | 'END_ROUND') {
    const roundId = metrics.currentRoundId || rounds.find((round) => round.status === 'PENDING' || round.status === 'PAUSED')?.id
    if (!roundId) return
    const socket = connectSocket(token)
    const emitAction = () => socket.emit(action, { roundId })
    if (socket.connected) emitAction()
    else socket.once('connect', emitAction)
    window.setTimeout(() => socket.disconnect(), 1500)
  }

  const selectedRound = rounds.find((round) => round.id === metrics.currentRoundId) || rounds.find((round) => round.status === 'PENDING' || round.status === 'PAUSED')
  const activeRound = metrics.currentRound || selectedRound?.name || 'No round selected'
  const hasActiveRound = Boolean(metrics.currentRoundId)
  const isPaused = selectedRound?.status === 'PAUSED'

  const shortcuts: Array<[string, 'operations' | 'contest' | 'review' | 'system']> = [['PARTICIPANTS', 'operations'], ['WORKSTATIONS', 'operations'], ['ROUNDS', 'contest'], ['PROBLEMS', 'contest'], ['SUBMISSIONS', 'review'], ['EVALUATIONS', 'review'], ['LEADERBOARD', 'review'], ['AUDIT LOGS', 'system'], ['SETTINGS', 'system']]
  return <main className="admin-shell"><header className="admin-topbar"><strong>CODE CLASH <span>/</span> COMMAND CENTER</strong><div><span className={hasActiveRound ? 'admin-live-badge active' : 'admin-live-badge'}>{hasActiveRound ? 'ROUND ACTIVE' : isPaused ? 'ROUND PAUSED' : 'NO ROUND ACTIVE'}</span><button className="icon-button" aria-label="Sign out" title="Sign out" onClick={onLogout}><LogOut size={15} /></button></div></header><div className="admin-layout"><aside className="admin-sidebar"><div className="sidebar-kicker">THE BRIDGE</div><strong>COMMAND CENTER</strong><nav>{shortcuts.map(([label, tab]) => <button className="admin-sidebar-link" key={label} onClick={() => { setSelectedTab(tab); document.querySelector('.admin-control')?.scrollIntoView({ behavior: 'smooth', block: 'start' }) }}>{label}</button>)}</nav></aside><section className="admin-content"><section className="admin-command-card"><div><div className="form-kicker">{hasActiveRound ? 'CURRENT ROUND' : 'ROUND CONTROL'} · {activeRound}</div><h1>Command Center</h1>{hasActiveRound && <p>Live contest operations are ready.</p>}</div><div className="admin-round-actions"><button className="admin-action primary" disabled={hasActiveRound || isPaused || !selectedRound} onClick={() => changeRound('START_ROUND')}><Play size={12} /> START</button><button className="admin-action" disabled={!hasActiveRound && !isPaused} onClick={() => changeRound(isPaused ? 'RESUME_ROUND' : 'PAUSE_ROUND')}>{isPaused ? <Play size={12} /> : <Pause size={12} />} {isPaused ? 'RESUME' : 'PAUSE'}</button><button className="admin-action" disabled={!hasActiveRound && !isPaused} onClick={() => changeRound('END_ROUND')}><Square size={12} /> END ROUND</button></div></section><Metrics metrics={metrics} /><section className="dashboard-card participant-roster"><div className="roster-heading"><ShieldCheck size={22} /><div><div className="form-kicker">REGISTERED PARTICIPANT ROSTER</div><h2>New signups appear automatically</h2></div></div><ParticipantTable participants={participants} /></section><AdminControlCenter token={token} selectedTab={selectedTab} onTabChange={setSelectedTab} /></section></div></main>
}
