'use client'

import { useEffect, useState } from 'react'
import { ClipboardList, Database, Gavel, Monitor, Plus, RefreshCw, Settings, ShieldCheck, Trash2, Unlock, UserCheck, Users, X } from 'lucide-react'
import { adminFetch, adminMutate } from '../../lib/api'
import type { AdminAuditLog, AdminEvaluation, AdminProblem, AdminRound, AdminSetting, AdminSubmission, AdminWorkstation, Participant, SuddenDeathRound, UserRole } from '../../lib/types'

type Tab = 'operations' | 'contest' | 'review' | 'system'
type Message = { kind: 'success' | 'error'; text: string } | null

export function AdminControlCenter({ token, selectedTab, onTabChange }: { token: string; selectedTab?: Tab; onTabChange?: (tab: Tab) => void }) {
  const [tab, setTab] = useState<Tab>(selectedTab || 'operations')
  const [message, setMessage] = useState<Message>(null)

  useEffect(() => {
    if (selectedTab) setTab(selectedTab)
  }, [selectedTab])

  function selectTab(nextTab: Tab) {
    setTab(nextTab)
    onTabChange?.(nextTab)
  }

  function notify(next: Message) {
    setMessage(next)
    window.setTimeout(() => setMessage(null), 3500)
  }

  return <section className="admin-control"><div className="control-heading"><div><div className="form-kicker">ADMIN OPERATIONS</div><h2>Control center</h2><p>Manage every contest surface available to authenticated administrators.</p></div><RefreshCw size={20} /></div><nav className="admin-tabs" aria-label="Admin controls">{([['operations', 'Operations', Users], ['contest', 'Contest setup', Gavel], ['review', 'Review desk', ClipboardList], ['system', 'System', Settings]] as const).map(([key, label, Icon]) => <button className={tab === key ? 'admin-tab active' : 'admin-tab'} key={key} onClick={() => selectTab(key)}><Icon size={15} />{label}</button>)}</nav>{message && <p className={message.kind === 'error' ? 'admin-message error' : 'admin-message'}>{message.text}</p>}{tab === 'operations' && <Operations token={token} notify={notify} />}{tab === 'contest' && <ContestSetup token={token} notify={notify} />}{tab === 'review' && <ReviewDesk token={token} notify={notify} />}{tab === 'system' && <SystemDesk token={token} notify={notify} />}</section>
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

  return <div className="admin-grid two-columns"><AdminSection title="Participant access" icon={<Users size={16} />}><div className="admin-table">{loading ? <p>Loading participants...</p> : participants.map((participant) => <div className="admin-row" key={participant.id}><div><strong>{participant.name}</strong><small>{participant.email} · {participant.collegeId || 'No college ID'}</small></div><b>{participant.status}</b><div className="row-actions"><button className="mini-button" onClick={() => void changeStatus(participant.id, 'CHECKED_IN')}><UserCheck size={13} /> Check in</button><button className="mini-button danger" onClick={() => void changeStatus(participant.id, 'DISQUALIFIED')}><X size={13} /> Disqualify</button></div></div>)}</div></AdminSection><AdminSection title="Workstations" icon={<Monitor size={16} />}><form className="inline-form" onSubmit={assignWorkstation}><input aria-label="PC number" placeholder="PC-01" value={pcNumber} onChange={(event) => setPcNumber(event.target.value)} required /><select aria-label="Participant" value={participantId} onChange={(event) => setParticipantId(event.target.value)} required><option value="">Select participant</option>{participants.filter((participant) => participant.status !== 'DISQUALIFIED').map((participant) => <option value={participant.id} key={participant.id}>{participant.name}</option>)}</select><button className="gold-button" type="submit"><Plus size={14} /> Assign</button></form><div className="admin-table">{workstations.map((workstation) => <div className="admin-row" key={workstation.id}><div><strong>{workstation.pcNumber}</strong><small>{workstation.participant?.name || 'Unassigned'}</small></div><button className="mini-button" onClick={() => void releaseWorkstation(workstation.id)}>Release</button></div>)}{!workstations.length && <p className="empty-roster">No workstations configured.</p>}</div></AdminSection></div>
}

function ContestSetup({ token, notify }: { token: string; notify: (message: Message) => void }) {
  const [rounds, setRounds] = useState<AdminRound[]>([])
  const [problems, setProblems] = useState<AdminProblem[]>([])
  const [roundName, setRoundName] = useState('')
  const [duration, setDuration] = useState('60')
  const [problem, setProblem] = useState({ title: '', description: '', inputFormat: '', outputFormat: '', constraints: '', difficulty: 'MEDIUM', timeLimit: '1000', memoryLimit: '256', roundId: '' })
  const [problemId, setProblemId] = useState('')
  const [testCase, setTestCase] = useState({ input: '', output: '', isHidden: true })
  const [example, setExample] = useState({ input: '', output: '', explanation: '' })
  const [loading, setLoading] = useState(true)

  async function load() {
    setLoading(true)
    const [roundResult, problemResult] = await Promise.all([adminFetch<AdminRound[]>(token, '/rounds'), adminFetch<AdminProblem[]>(token, '/problems')])
    setRounds(roundResult.data || []); setProblems(problemResult.data || []); setLoading(false)
  }
  useEffect(() => { void load() }, [token])

  async function createRound(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const result = await adminMutate<AdminRound>(token, '/rounds', 'POST', { name: roundName, duration: Number(duration) })
    if (!result.response.ok) return notify({ kind: 'error', text: 'Could not create round.' })
    setRoundName(''); notify({ kind: 'success', text: 'Round created.' }); void load()
  }

  async function createProblem(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const result = await adminMutate<AdminProblem>(token, '/problems', 'POST', { ...problem, timeLimit: Number(problem.timeLimit), memoryLimit: Number(problem.memoryLimit) })
    if (!result.response.ok) return notify({ kind: 'error', text: 'Could not create problem.' })
    setProblem({ title: '', description: '', inputFormat: '', outputFormat: '', constraints: '', difficulty: 'MEDIUM', timeLimit: '1000', memoryLimit: '256', roundId: '' }); notify({ kind: 'success', text: 'Problem created.' }); void load()
  }

  async function roundAction(id: string, action: 'reset') {
    const result = await adminMutate<AdminRound>(token, `/rounds/${id}/${action}`, 'POST')
    if (!result.response.ok) return notify({ kind: 'error', text: 'Could not update round.' })
    notify({ kind: 'success', text: 'Round reset.' }); void load()
  }

  async function deleteProblem(id: string) {
    const result = await adminMutate<null>(token, `/problems/${id}`, 'DELETE')
    if (!result.response.ok) return notify({ kind: 'error', text: 'Could not delete problem.' })
    notify({ kind: 'success', text: 'Problem deleted.' }); void load()
  }

  async function addProblemData(kind: 'test-cases' | 'examples', event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const body = kind === 'test-cases' ? testCase : example
    const result = await adminMutate<AdminProblem>(token, `/problems/${problemId}/${kind}`, 'POST', body)
    if (!result.response.ok) return notify({ kind: 'error', text: `Could not add ${kind === 'test-cases' ? 'test case' : 'example'}.` })
    if (kind === 'test-cases') setTestCase({ input: '', output: '', isHidden: true })
    else setExample({ input: '', output: '', explanation: '' })
    notify({ kind: 'success', text: `${kind === 'test-cases' ? 'Test case' : 'Example'} added.` }); void load()
  }

  async function duplicateProblem(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const result = await adminMutate<AdminProblem>(token, `/problems/${problemId}/duplicate`, 'POST', { roundId: problem.roundId || undefined })
    if (!result.response.ok) return notify({ kind: 'error', text: 'Could not duplicate problem.' })
    notify({ kind: 'success', text: 'Problem duplicated.' }); void load()
  }

  return <div className="admin-grid two-columns"><AdminSection title="Rounds" icon={<Gavel size={16} />}><form className="stack-form" onSubmit={createRound}><input placeholder="Round name" value={roundName} onChange={(event) => setRoundName(event.target.value)} required /><input type="number" min="1" placeholder="Duration in minutes" value={duration} onChange={(event) => setDuration(event.target.value)} required /><button className="gold-button" type="submit"><Plus size={14} /> Create round</button></form><div className="admin-table">{loading ? <p>Loading contest setup...</p> : rounds.map((round) => <div className="admin-row" key={round.id}><div><strong>{round.name}</strong><small>{round.duration} minutes · {round.status}</small></div><button className="mini-button" onClick={() => void roundAction(round.id, 'reset')}><RefreshCw size={13} /> Reset</button></div>)}</div></AdminSection><AdminSection title="Problems" icon={<Database size={16} />}><form className="stack-form" onSubmit={createProblem}><input placeholder="Problem title" value={problem.title} onChange={(event) => setProblem({ ...problem, title: event.target.value })} required /><select value={problem.roundId} onChange={(event) => setProblem({ ...problem, roundId: event.target.value })} required><option value="">Attach to round</option>{rounds.map((round) => <option value={round.id} key={round.id}>{round.name}</option>)}</select><textarea placeholder="Description" value={problem.description} onChange={(event) => setProblem({ ...problem, description: event.target.value })} required /><div className="form-pair"><input placeholder="Input format" value={problem.inputFormat} onChange={(event) => setProblem({ ...problem, inputFormat: event.target.value })} required /><input placeholder="Output format" value={problem.outputFormat} onChange={(event) => setProblem({ ...problem, outputFormat: event.target.value })} required /></div><div className="form-pair"><input placeholder="Time limit (ms)" value={problem.timeLimit} onChange={(event) => setProblem({ ...problem, timeLimit: event.target.value })} required /><input placeholder="Memory limit (MB)" value={problem.memoryLimit} onChange={(event) => setProblem({ ...problem, memoryLimit: event.target.value })} required /></div><button className="gold-button" type="submit"><Plus size={14} /> Create problem</button></form><div className="admin-table">{problems.map((item) => <div className="admin-row" key={item.id}><div><strong>{item.title}</strong><small>{item.difficulty} · {item.round?.name || 'No round'}</small></div><button className="mini-button danger" onClick={() => void deleteProblem(item.id)}><Trash2 size={13} /> Delete</button></div>)}</div><div className="advanced-tools"><div className="form-kicker">PROBLEM DATA TOOLS</div><select value={problemId} onChange={(event) => setProblemId(event.target.value)}><option value="">Select problem</option>{problems.map((item) => <option value={item.id} key={item.id}>{item.title}</option>)}</select><form className="stack-form" onSubmit={(event) => void duplicateProblem(event)}><button className="mini-button" type="submit" disabled={!problemId}><Database size={13} /> Duplicate selected</button></form><form className="stack-form" onSubmit={(event) => void addProblemData('test-cases', event)}><input placeholder="Test input" value={testCase.input} onChange={(event) => setTestCase({ ...testCase, input: event.target.value })} required /><input placeholder="Expected output" value={testCase.output} onChange={(event) => setTestCase({ ...testCase, output: event.target.value })} required /><button className="mini-button" type="submit" disabled={!problemId}><Plus size={13} /> Add test case</button></form><form className="stack-form" onSubmit={(event) => void addProblemData('examples', event)}><input placeholder="Example input" value={example.input} onChange={(event) => setExample({ ...example, input: event.target.value })} required /><input placeholder="Example output" value={example.output} onChange={(event) => setExample({ ...example, output: event.target.value })} required /><input placeholder="Explanation (optional)" value={example.explanation} onChange={(event) => setExample({ ...example, explanation: event.target.value })} /><button className="mini-button" type="submit" disabled={!problemId}><Plus size={13} /> Add example</button></form></div></AdminSection></div>
}

function ReviewDesk({ token, notify }: { token: string; notify: (message: Message) => void }) {
  const [submissions, setSubmissions] = useState<AdminSubmission[]>([])
  const [evaluations, setEvaluations] = useState<AdminEvaluation[]>([])
  const [participantId, setParticipantId] = useState('')
  const [adjustmentId, setAdjustmentId] = useState('')
  const [scores, setScores] = useState({ round1Score: '0', round2Score: '0', manualAdjustments: '0', reason: '' })

  async function load() {
    const [submissionResult, evaluationResult] = await Promise.all([adminFetch<AdminSubmission[]>(token, '/submissions'), adminFetch<AdminEvaluation[]>(token, '/evaluations')])
    setSubmissions(submissionResult.data || []); setEvaluations(evaluationResult.data || [])
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

  return <div className="admin-grid two-columns"><AdminSection title="Submission review" icon={<ClipboardList size={16} />}><div className="admin-table compact-table">{submissions.slice(0, 20).map((submission) => <div className="admin-row" key={submission.id}><div><strong>{submission.participant.name}</strong><small>{submission.problem.title} · {submission.language}</small></div><b>{submission.status}</b><button className="mini-button" onClick={() => navigator.clipboard?.writeText(submission.sourceCode)}>Copy code</button></div>)}{!submissions.length && <p className="empty-roster">No submissions available.</p>}</div></AdminSection><AdminSection title="Evaluation and scoring" icon={<ShieldCheck size={16} />}><form className="stack-form" onSubmit={adjustScore}><input placeholder="Participant ID" value={participantId} onChange={(event) => setParticipantId(event.target.value)} required /><div className="form-pair"><input type="number" placeholder="Round 1" value={scores.round1Score} onChange={(event) => setScores({ ...scores, round1Score: event.target.value })} /><input type="number" placeholder="Round 2" value={scores.round2Score} onChange={(event) => setScores({ ...scores, round2Score: event.target.value })} /></div><input type="number" placeholder="Manual adjustment" value={scores.manualAdjustments} onChange={(event) => setScores({ ...scores, manualAdjustments: event.target.value })} /><input placeholder="Reason" value={scores.reason} onChange={(event) => setScores({ ...scores, reason: event.target.value })} required /><button className="gold-button" type="submit"><Plus size={14} /> Adjust score</button></form><form className="inline-form" onSubmit={reverseScore}><input placeholder="Adjustment ID to reverse" value={adjustmentId} onChange={(event) => setAdjustmentId(event.target.value)} required /><button className="mini-button danger" type="submit"><RefreshCw size={13} /> Reverse</button></form><div className="admin-table">{evaluations.map((evaluation) => <div className="admin-row" key={evaluation.id}><div><strong>{evaluation.participant.name}</strong><small>Final score: {evaluation.finalScore} · {evaluation.lockedAt ? 'Locked' : 'Open'}</small></div><button className="mini-button" onClick={() => void lockEvaluation(evaluation.id, !evaluation.lockedAt)}>{evaluation.lockedAt ? <Unlock size={13} /> : <ShieldCheck size={13} />}{evaluation.lockedAt ? 'Unlock' : 'Lock'}</button></div>)}</div></AdminSection></div>
}

function SystemDesk({ token, notify }: { token: string; notify: (message: Message) => void }) {
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

  return <div className="admin-grid two-columns"><AdminSection title="Settings and audit" icon={<Settings size={16} />}><form className="inline-form" onSubmit={saveSetting}><input placeholder="Setting key" value={settingKey} onChange={(event) => setSettingKey(event.target.value)} required /><input placeholder="Value" value={settingValue} onChange={(event) => setSettingValue(event.target.value)} required /><button className="gold-button" type="submit">Save</button></form><form className="inline-form" onSubmit={updateRole}><input placeholder="User ID" value={roleUserId} onChange={(event) => setRoleUserId(event.target.value)} required /><select value={role} onChange={(event) => setRole(event.target.value as UserRole)}><option value="PARTICIPANT">Participant</option><option value="JUDGE">Judge</option><option value="ADMIN">Admin</option></select><button className="mini-button" type="submit"><UserCheck size={13} /> Set role</button></form><div className="admin-table">{settings.map((setting) => <div className="admin-row" key={setting.key}><div><strong>{setting.key}</strong><small>{setting.value}</small></div></div>)}{logs.slice(0, 12).map((log) => <div className="admin-row" key={log.id}><div><strong>{log.actionType}</strong><small>{log.description}</small></div></div>)}</div></AdminSection><AdminSection title="Sudden death" icon={<Gavel size={16} />}><form className="stack-form" onSubmit={createSuddenDeath}><input placeholder="Round name" value={suddenForm.name} onChange={(event) => setSuddenForm({ ...suddenForm, name: event.target.value })} required /><div className="form-pair"><input type="number" min="1" placeholder="Duration" value={suddenForm.duration} onChange={(event) => setSuddenForm({ ...suddenForm, duration: event.target.value })} required /><input type="number" placeholder="Bonus points" value={suddenForm.bonusPoints} onChange={(event) => setSuddenForm({ ...suddenForm, bonusPoints: event.target.value })} /></div><input placeholder="Participant IDs, comma separated" value={suddenForm.participantIds} onChange={(event) => setSuddenForm({ ...suddenForm, participantIds: event.target.value })} required /><button className="gold-button" type="submit"><Plus size={14} /> Create round</button></form><div className="admin-table">{suddenDeath.map((round) => <div className="admin-row" key={round.id}><div><strong>{round.name}</strong><small>{round.duration} minutes · {round.status}</small></div>{round.status === 'PENDING' ? <button className="mini-button" onClick={() => void updateSuddenDeath(round.id, 'start')}>Start</button> : round.status === 'ACTIVE' ? <button className="mini-button" onClick={() => void updateSuddenDeath(round.id, 'end')}>End</button> : null}</div>)}</div></AdminSection></div>
}

function AdminSection({ title, icon, children }: { title: string; icon: React.ReactNode; children: React.ReactNode }) {
  return <section className="admin-section"><div className="section-heading">{icon}<div><div className="form-kicker">ADMIN MODULE</div><h3>{title}</h3></div></div>{children}</section>
}
