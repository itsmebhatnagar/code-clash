'use client'

import { useEffect, useState } from 'react'
import { ClipboardList, Compass, Database, Gavel, Monitor, Plus, RefreshCw, Settings, ShieldCheck, Trash2, Unlock, UserCheck, Users, X } from 'lucide-react'
import { adminFetch, adminMutate, getLeaderboard } from '../../lib/api'
import type { AdminAuditLog, AdminEvaluation, AdminProblem, AdminRound, AdminSetting, AdminSubmission, AdminWorkstation, LeaderboardEntry, Participant, SuddenDeathRound, UserRole } from '../../lib/types'
import { ContestSetup as ContestSetupWorkflow } from './ContestSetup'

export type AdminPage = 'participants' | 'workstations' | 'rounds' | 'problems' | 'submissions' | 'evaluations' | 'leaderboard' | 'audit-logs' | 'settings'
type Message = { kind: 'success' | 'error'; text: string } | null

const pageDetails: Record<AdminPage, { title: string; description: string; section: string; Icon: typeof Users }> = {
  participants: { title: 'Crew Manifest', description: 'Review registrations and manage pirate access.', section: 'OPERATIONS', Icon: Users },
  workstations: { title: 'Stations', description: 'Assign and release ship stations.', section: 'OPERATIONS', Icon: Monitor },
  rounds: { title: 'Voyages', description: 'Configure contest voyages and their duration.', section: 'VOYAGE SETUP', Icon: Gavel },
  problems: { title: 'Challenges', description: 'Create trials, examples, and bounty data.', section: 'VOYAGE SETUP', Icon: Database },
  submissions: { title: 'Captain Logs', description: 'Inspect submitted logs and execution results.', section: 'REVIEW DECK', Icon: ClipboardList },
  evaluations: { title: 'Appraisals', description: 'Manage final bounties, adjustments, and locks.', section: 'REVIEW DECK', Icon: ShieldCheck },
  leaderboard: { title: 'Bounty Board', description: 'Review current standings and tie-break details.', section: 'REVIEW DECK', Icon: ShieldCheck },
  'audit-logs': { title: 'Ship Logs', description: 'Trace captain actions across the voyage.', section: 'SYSTEM', Icon: ClipboardList },
  settings: { title: 'Quarters', description: 'Manage ship settings, roles, and sudden-death events.', section: 'SYSTEM', Icon: Settings }
}

export function AdminControlCenter({ token, selectedTab = 'participants', onTabChange }: { token: string; selectedTab?: AdminPage; onTabChange?: (page: AdminPage) => void }) {
  const page = selectedTab
  const { title, description, section, Icon } = pageDetails[page]
  const [message, setMessage] = useState<Message>(null)

  function notify(next: Message) {
    setMessage(next)
    window.setTimeout(() => setMessage(null), 3500)
  }

  return <section className={`admin-control admin-page admin-page-${page}`}><div className="control-heading"><div><div className="form-kicker">THE BRIDGE / {section}</div><h2>{title}</h2><p>{description}</p></div><Icon size={22} /></div>{message && <p className={message.kind === 'error' ? 'admin-message error' : 'admin-message'}>{message.text}</p>}{(page === 'participants' || page === 'workstations') && <Operations token={token} notify={notify} />}{(page === 'rounds' || page === 'problems') && <ContestSetupWorkflow token={token} page={page} notify={notify} onNavigate={onTabChange ?? (() => {})} />}{(page === 'submissions' || page === 'evaluations' || page === 'leaderboard') && <ReviewDesk token={token} notify={notify} />}{(page === 'audit-logs' || page === 'settings') && <SystemDesk token={token} notify={notify} page={page} />}</section>
}

function Operations({ token, notify }: { token: string; notify: (message: Message) => void }) {
  const [participants, setParticipants] = useState<Participant[]>([])
  const [workstations, setWorkstations] = useState<AdminWorkstation[]>([])
  const [pcNumber, setPcNumber] = useState('')
  const [participantId, setParticipantId] = useState('')
  const [adjustmentId, setAdjustmentId] = useState('')
  const [loading, setLoading] = useState(true)

  async function load() {
    setLoading(true)
    const [participantResult, workstationResult] = await Promise.all([adminFetch<Participant[]>(token, '/participants'), adminFetch<AdminWorkstation[]>(token, '/workstations')])
    setParticipants(participantResult.data || [])
    setWorkstations(workstationResult.data || [])
    setLoading(false)
  }
  useEffect(() => { void load() }, [token])

  async function changeStatus(id: string, status: string) {
    const reason = status === 'DISQUALIFIED' ? window.prompt('Reason for disqualification') : undefined
    if (status === 'DISQUALIFIED' && !reason) return
    const result = await adminMutate<Participant>(token, `/participants/${id}/status`, 'PUT', { status, reason, collegeIdVerified: true })
    if (!result.response.ok) return notify({ kind: 'error', text: 'Could not update participant status.' })
    notify({ kind: 'success', text: `Participant marked ${status.toLowerCase()}.` })
    void load()
  }

  async function assignWorkstation(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const result = await adminMutate<AdminWorkstation>(token, '/workstations/assign', 'POST', { pcNumber, participantId })
    if (!result.response.ok) return notify({ kind: 'error', text: 'Could not assign workstation.' })
    setPcNumber(''); setParticipantId(''); notify({ kind: 'success', text: 'Workstation assigned.' }); void load()
  }

  async function releaseWorkstation(id: string) {
    const result = await adminMutate<null>(token, `/workstations/${id}/release`, 'DELETE')
    if (!result.response.ok) return notify({ kind: 'error', text: 'Could not release workstation.' })
    notify({ kind: 'success', text: 'Workstation released.' }); void load()
  }

  return <div className="admin-grid two-columns"><AdminSection title="Crew access" icon={<Users size={16} />}><div className="admin-table">{loading ? <div className="loading-state"><Compass className="compass-icon" size={24} /> <span>Gathering crew manifest...</span></div> : participants.map((participant) => <div className="admin-row" key={participant.id}><div><strong>{participant.name}</strong><small>{participant.email} · {participant.collegeId || 'No college ID'}</small></div><b>{participant.status}</b><div className="row-actions"><button className="mini-button" onClick={() => void changeStatus(participant.id, 'CHECKED_IN')}><UserCheck size={13} /> Check in</button><button className="mini-button danger" onClick={() => void changeStatus(participant.id, 'DISQUALIFIED')}><X size={13} /> Disqualify</button></div></div>)}</div></AdminSection><AdminSection title="Stations" icon={<Monitor size={16} />}><form className="inline-form" onSubmit={assignWorkstation}><input aria-label="PC number" placeholder="PC-01" value={pcNumber} onChange={(event) => setPcNumber(event.target.value)} required /><select aria-label="Participant" value={participantId} onChange={(event) => setParticipantId(event.target.value)} required><option value="">Select pirate</option>{participants.filter((participant) => participant.status !== 'DISQUALIFIED').map((participant) => <option value={participant.id} key={participant.id}>{participant.name}</option>)}</select><button className="gold-button" type="submit"><Plus size={14} /> Assign</button></form><div className="admin-table">{workstations.map((workstation) => <div className="admin-row" key={workstation.id}><div><strong>{workstation.pcNumber}</strong><small>{workstation.participant?.name || 'Unassigned'}</small></div><button className="mini-button" onClick={() => void releaseWorkstation(workstation.id)}>Release</button></div>)}{!workstations.length && <p className="empty-roster">No stations configured.</p>}</div></AdminSection></div>
}

function ReviewDesk({ token, notify }: { token: string; notify: (message: Message) => void }) {
  const [submissions, setSubmissions] = useState<AdminSubmission[]>([])
  const [evaluations, setEvaluations] = useState<AdminEvaluation[]>([])
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([])
  const [participantId, setParticipantId] = useState('')
  const [adjustmentId, setAdjustmentId] = useState('')
  const [scores, setScores] = useState({ manualAdjustments: '0', reason: '' })

  async function load() {
    const [submissionResult, evaluationResult, leaderboardResult] = await Promise.all([adminFetch<AdminSubmission[]>(token, '/submissions'), adminFetch<AdminEvaluation[]>(token, '/evaluations'), getLeaderboard()])
    setSubmissions(submissionResult.data || []); setEvaluations(evaluationResult.data || []); setLeaderboard(leaderboardResult)
  }
  useEffect(() => { void load() }, [token])

  async function lockEvaluation(id: string, locked: boolean) {
    const result = await adminMutate<AdminEvaluation>(token, `/evaluations/${id}/${locked ? 'lock' : 'unlock'}`, 'POST')
    if (!result.response.ok) return notify({ kind: 'error', text: 'Could not change evaluation lock.' })
    notify({ kind: 'success', text: locked ? 'Evaluation locked.' : 'Evaluation unlocked.' }); void load()
  }

  async function adjustScore(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const result = await adminMutate<AdminEvaluation>(token, '/scores/adjust', 'POST', { participantId, ...scores })
    if (!result.response.ok) return notify({ kind: 'error', text: 'Could not adjust score.' })
    setParticipantId(''); notify({ kind: 'success', text: 'Score adjusted.' }); void load()
  }

  async function reverseScore(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const result = await adminMutate<AdminEvaluation>(token, `/scores/${adjustmentId}/reverse`, 'POST')
    if (!result.response.ok) return notify({ kind: 'error', text: 'Could not reverse score adjustment.' })
    setAdjustmentId(''); notify({ kind: 'success', text: 'Score adjustment reversed.' }); void load()
  }

  return <div className="admin-grid two-columns">
    <AdminSection title="Submission review" icon={<ClipboardList size={16} />}>
      <div className="admin-table compact-table">{submissions.slice(0, 20).map((submission) => <div className="admin-row" key={submission.id}><div><strong>{submission.participant.name}</strong><small>{submission.problem.title} · {submission.language}</small><small>Compile {submission.compilationTime == null ? 'N/A' : `${submission.compilationTime} ms`} · Run {submission.executionTime == null ? 'N/A' : `${submission.executionTime} ms`}{submission.maxTestCaseExecutionTime == null ? '' : ` (max ${submission.maxTestCaseExecutionTime} ms)`}</small></div><b>{submission.status}</b><button className="mini-button" onClick={() => navigator.clipboard?.writeText(submission.sourceCode)}>Copy code</button></div>)}{!submissions.length && <p className="empty-roster">No submissions available.</p>}</div>
    </AdminSection>
    <AdminSection title="Evaluation and scoring" icon={<ShieldCheck size={16} />}>
      <form className="stack-form" onSubmit={adjustScore}><input placeholder="Participant ID" value={participantId} onChange={(event) => setParticipantId(event.target.value)} required /><input type="number" min="-500" max="500" placeholder="Manual adjustment (-500 to 500)" value={scores.manualAdjustments} onChange={(event) => setScores({ ...scores, manualAdjustments: event.target.value })} /><input placeholder="Reason" value={scores.reason} onChange={(event) => setScores({ ...scores, reason: event.target.value })} required /><button className="gold-button" type="submit"><Plus size={14} /> Adjust total</button></form>
      <form className="inline-form" onSubmit={reverseScore}><input placeholder="Adjustment ID to reverse" value={adjustmentId} onChange={(event) => setAdjustmentId(event.target.value)} required /><button className="mini-button danger" type="submit"><RefreshCw size={13} /> Reverse</button></form>
      <div className="admin-table">{evaluations.map((evaluation) => <div className="admin-row" key={evaluation.id}><div><strong>{evaluation.participant.name}</strong><small>Code Run {evaluation.round1Score} · Code in the Dark {evaluation.round2Score}</small><small>Total {evaluation.finalScore} · Tie-break {evaluation.tieBreakTimeMs} ms · {evaluation.lockedAt ? 'Locked' : 'Open'}</small></div><button className="mini-button" onClick={() => void lockEvaluation(evaluation.id, !evaluation.lockedAt)}>{evaluation.lockedAt ? <Unlock size={13} /> : <ShieldCheck size={13} />}{evaluation.lockedAt ? 'Unlock' : 'Lock'}</button></div>)}</div>
    </AdminSection>
    <AdminSection title="Leaderboard" icon={<ShieldCheck size={16} />}>
      <div className="admin-table compact-table">{leaderboard.map((entry) => <div className="admin-row" key={entry.participantId}><div><strong>#{entry.rank} {entry.name}</strong><small>Code Run {entry.round1Score} · Code in the Dark {entry.round2Score}</small><small>{entry.college || 'College not provided'} · {entry.tieBreakTimeMs} ms</small></div><b>{entry.finalScore} PTS</b></div>)}{!leaderboard.length && <p className="empty-roster">No scored participants yet.</p>}</div>
    </AdminSection>
  </div>
}

function SystemDesk({ token, notify, page }: { token: string; notify: (message: Message) => void; page: 'audit-logs' | 'settings' }) {
  const [logs, setLogs] = useState<AdminAuditLog[]>([])
  const [settings, setSettings] = useState<AdminSetting[]>([])
  const [settingKey, setSettingKey] = useState('')
  const [settingValue, setSettingValue] = useState('')
  const [suddenDeath, setSuddenDeath] = useState<SuddenDeathRound[]>([])
  const [suddenForm, setSuddenForm] = useState({ name: 'Sudden Death', duration: '15', participantIds: '', bonusPoints: '0', problemId: '' })
  const [roleUserId, setRoleUserId] = useState('')
  const [role, setRole] = useState<UserRole>('PARTICIPANT')

  async function load() {
    const [logResult, settingResult, suddenResult] = await Promise.all([adminFetch<AdminAuditLog[]> (token, '/audit-logs'), adminFetch<AdminSetting[]>(token, '/settings'), adminFetch<SuddenDeathRound[]>(token, '/sudden-death')])
    setLogs(logResult.data || []); setSettings(settingResult.data || []); setSuddenDeath(suddenResult.data || [])
  }
  useEffect(() => { void load() }, [token])

  async function saveSetting(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const result = await adminMutate<AdminSetting>(token, `/settings/${encodeURIComponent(settingKey)}`, 'PUT', { value: settingValue })
    if (!result.response.ok) return notify({ kind: 'error', text: 'Could not save setting.' })
    setSettingKey(''); setSettingValue(''); notify({ kind: 'success', text: 'Setting saved.' }); void load()
  }

  async function createSuddenDeath(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const participantIds = suddenForm.participantIds.split(',').map((id) => id.trim()).filter(Boolean)
    const result = await adminMutate<SuddenDeathRound>(token, '/sudden-death', 'POST', { ...suddenForm, duration: Number(suddenForm.duration), bonusPoints: Number(suddenForm.bonusPoints), participantIds })
    if (!result.response.ok) return notify({ kind: 'error', text: 'Could not create sudden-death round.' })
    notify({ kind: 'success', text: 'Sudden-death round created.' }); void load()
  }

  async function updateSuddenDeath(id: string, action: 'start' | 'end') {
    const result = await adminMutate<SuddenDeathRound>(token, `/sudden-death/${id}/${action}`, 'POST')
    if (!result.response.ok) return notify({ kind: 'error', text: 'Could not update sudden-death round.' })
    notify({ kind: 'success', text: `Sudden-death round ${action}ed.` }); void load()
  }

  async function updateRole(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const result = await adminMutate(token, `/users/${roleUserId}/role`, 'PUT', { role })
    if (!result.response.ok) return notify({ kind: 'error', text: 'Could not update user role.' })
    setRoleUserId(''); notify({ kind: 'success', text: 'User role updated.' })
  }

  return <div className={page === 'audit-logs' ? 'admin-grid audit-logs-grid' : 'admin-grid two-columns'}>
    {page === 'settings' && <AdminSection title="Settings and roles" icon={<Settings size={16} />}>
      <form className="inline-form" onSubmit={saveSetting}><input placeholder="Setting key" value={settingKey} onChange={(event) => setSettingKey(event.target.value)} required /><input placeholder="Value" value={settingValue} onChange={(event) => setSettingValue(event.target.value)} required /><button className="gold-button" type="submit">Save</button></form>
      <form className="inline-form" onSubmit={updateRole}><input placeholder="User ID" value={roleUserId} onChange={(event) => setRoleUserId(event.target.value)} required /><select value={role} onChange={(event) => setRole(event.target.value as UserRole)}><option value="PARTICIPANT">Participant</option><option value="JUDGE">Judge</option><option value="ADMIN">Admin</option></select><button className="mini-button" type="submit"><UserCheck size={13} /> Set role</button></form>
      <div className="admin-table">{settings.map((setting) => <div className="admin-row" key={setting.key}><div><strong>{setting.key}</strong><small>{setting.value}</small></div></div>)}</div>
    </AdminSection>}
    {page === 'audit-logs' && <AdminSection title="Audit log" icon={<ClipboardList size={16} />}>
      <div className="admin-table">{logs.slice(0, 40).map((log) => <div className="admin-row" key={log.id}><div><strong>{log.actionType}</strong><small>{log.description}</small></div></div>)}{!logs.length && <p className="empty-roster">No audit events recorded.</p>}</div>
    </AdminSection>}
    {page === 'settings' && <AdminSection title="Sudden death" icon={<Gavel size={16} />}>
      <form className="stack-form" onSubmit={createSuddenDeath}><input placeholder="Round name" value={suddenForm.name} onChange={(event) => setSuddenForm({ ...suddenForm, name: event.target.value })} required /><div className="form-pair"><input type="number" min="1" placeholder="Duration" value={suddenForm.duration} onChange={(event) => setSuddenForm({ ...suddenForm, duration: event.target.value })} required /><input type="number" placeholder="Bonus points" value={suddenForm.bonusPoints} onChange={(event) => setSuddenForm({ ...suddenForm, bonusPoints: event.target.value })} /></div><input placeholder="Participant IDs, comma separated" value={suddenForm.participantIds} onChange={(event) => setSuddenForm({ ...suddenForm, participantIds: event.target.value })} required /><button className="gold-button" type="submit"><Plus size={14} /> Create round</button></form>
      <div className="admin-table">{suddenDeath.map((round) => <div className="admin-row" key={round.id}><div><strong>{round.name}</strong><small>{round.duration} minutes · {round.status}</small></div>{round.status === 'PENDING' ? <button className="mini-button" onClick={() => void updateSuddenDeath(round.id, 'start')}>Start</button> : round.status === 'ACTIVE' ? <button className="mini-button" onClick={() => void updateSuddenDeath(round.id, 'end')}>End</button> : null}</div>)}</div>
    </AdminSection>}
  </div>
}

function AdminSection({ title, icon, children }: { title: string; icon: React.ReactNode; children: React.ReactNode }) {
  return <section className="admin-section"><div className="section-heading">{icon}<div><div className="form-kicker">ADMIN MODULE</div><h3>{title}</h3></div></div>{children}</section>
}
