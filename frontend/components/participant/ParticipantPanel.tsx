'use client'

import { LogOut, ShieldCheck } from 'lucide-react'
import { useCallback, useState } from 'react'
import { useContestSocket } from '../../hooks/useContestSocket'
import { useParticipantDashboard } from '../../hooks/useParticipantDashboard'
import { submitCode } from '../../lib/api'
import type { SubmissionResult, User } from '../../lib/types'
import { CodeEditor } from './CodeEditor'
import { ProblemView } from './ProblemView'

export function ParticipantPanel({ user, token, onLogout }: { user: User; token: string; onLogout: () => void }) {
  const { dashboard, refresh } = useParticipantDashboard(token)
  const [language, setLanguage] = useState('javascript')
  const [sourceCode, setSourceCode] = useState('')
  const [submissionId, setSubmissionId] = useState<string | null>(null)
  const [result, setResult] = useState<SubmissionResult | null>(null)
  const [message, setMessage] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const onResult = useCallback((data: SubmissionResult) => { setResult(data); setMessage(''); refresh() }, [refresh])
  useContestSocket(token, 'SUBMISSION_RESULT', onResult)

  async function handleSubmit() {
    if (isSubmitting) return
    const round = dashboard.round
    const problem = round?.problems[0]
    if (!round || !problem || !sourceCode.trim()) return setMessage('Write code before submitting.')
    setIsSubmitting(true); setMessage('Submitting to judge worker...'); setResult(null)
    try {
      const { response, data } = await submitCode(token, { problemId: problem.id, roundId: round.id, language, sourceCode })
      if (!response.ok || !data.id) return setMessage(data.error || 'Submission rejected')
      setSubmissionId(data.id); setMessage('PENDING: queued for compilation and execution.')
    } catch { setMessage('Network error. Could not submit code.') } finally { setIsSubmitting(false) }
  }

  const round = dashboard.round
  const stats = dashboard.stats

  return <main className="participant-shell">
    <header className="participant-topbar"><div className="brand-lockup"><span className="brand-mark">◈</span><strong>CODE CLASH</strong></div>{round && <div className="participant-status"><span><span className="status-dot" /> LIVE COMPETITION</span><b>{round.name}</b></div>}<button className="icon-button" aria-label="Sign out" title="Sign out" onClick={onLogout}><LogOut size={16} /></button></header>
    <div className="participant-layout">
      <section className={round ? 'participant-content' : 'participant-content waiting-content'}>
        {!round ? <section className="participant-empty"><ShieldCheck size={24} /><div><div className="form-kicker">CONTEST STATUS</div><h1>Awaiting the next round.</h1><p>The command deck will unlock when an administrator starts a round.</p></div></section> : <>
          <section className="contest-overview"><div><div className="form-kicker">{round.name}</div><h1>The waters are live.</h1><p>{round.problems.length} problems charted. Your next move sets the course.</p></div><span className="overview-live">LIVE</span></section>
          <section className="participant-metrics"><div><span>PROBLEMS SOLVED</span><strong>{stats?.solved ?? 0} / {stats?.totalProblems ?? round.problems.length}</strong></div><div><span>CURRENT RANK</span><strong>{stats?.rank ? `#${stats.rank}` : '--'}</strong></div><div><span>TREASURE SCORE</span><strong>{stats?.score ?? 0}</strong></div><div><span>PROBLEMS ATTEMPTED</span><strong>{stats?.attempted ?? 0} / {stats?.totalProblems ?? round.problems.length}</strong></div></section>
          <section className="participant-workspace"><div className="workspace-title"><span>01 — {round.problems[0]?.title || 'CURRENT PROBLEM'}</span><div><small>{language.toUpperCase()}</small><button className="workspace-action" type="button" onClick={handleSubmit}>RUN CODE</button></div></div><div className="workspace-body">{round.problems[0] ? <><ProblemView problem={round.problems[0]} /><CodeEditor language={language} sourceCode={sourceCode} submissionId={submissionId} message={message} result={result} isSubmitting={isSubmitting} onLanguageChange={setLanguage} onSourceChange={setSourceCode} onSubmit={handleSubmit} /></> : <p className="empty-roster">No problems have been added to this round yet.</p>}</div></section>
        </>}
      </section>
    </div>
  </main>
}
