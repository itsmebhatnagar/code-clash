'use client'

import { LogOut, ShieldCheck } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useContestSocket } from '../../hooks/useContestSocket'
import { useParticipantDashboard } from '../../hooks/useParticipantDashboard'
import { useActivityPing } from '../../hooks/useActivityPing'
import { submitCode } from '../../lib/api'
import type { SubmissionResult, User } from '../../lib/types'
import { CodeEditor } from './CodeEditor'
import { ProblemView } from './ProblemView'

export function ParticipantPanel({ user, token, onLogout }: { user: User; token: string; onLogout: () => void }) {
  const { dashboard, refresh } = useParticipantDashboard(token)
  const [language, setLanguage] = useState('c')
  const [sourceCode, setSourceCode] = useState('')
  const [selectedProblemId, setSelectedProblemId] = useState('')
  const [submissionId, setSubmissionId] = useState<string | null>(null)
  const [result, setResult] = useState<SubmissionResult | null>(null)
  const [message, setMessage] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [now, setNow] = useState(Date.now())
  const activeRoundId = useRef<string | null>(null)
  const submitRef = useRef<() => void>(() => {})
  const onResult = useCallback((data: SubmissionResult) => {
    if (data.id !== submissionId) return
    setResult(data); setMessage(''); refresh()
  }, [refresh, submissionId])
  useContestSocket(token, 'SUBMISSION_RESULT', onResult)
  useActivityPing(token)

  useEffect(() => {
    setSelectedProblemId(''); setSubmissionId(null); setResult(null); setMessage('')
  }, [dashboard.round?.id])

  useEffect(() => {
    if (!dashboard.round) return
    const timer = window.setInterval(() => setNow(Date.now()), 200)
    return () => window.clearInterval(timer)
  }, [dashboard.round?.id])

  activeRoundId.current = dashboard.round?.id ?? null
  const onForceSubmit = useCallback((data: { roundId: string }) => {
    if (data.roundId === activeRoundId.current) submitRef.current()
  }, [])
  useContestSocket(token, 'FORCE_SUBMIT', onForceSubmit)

  function selectProblem(id: string) {
    setSelectedProblemId(id); setSubmissionId(null); setResult(null); setMessage('')
  }

  async function handleSubmit() {
    if (isSubmitting) return
    const round = dashboard.round
    const problem = round?.problems.find((item) => item.id === selectedProblemId) || round?.problems[0]
    if (!round || !problem || !sourceCode.trim()) return setMessage('Write code before submitting.')
    setIsSubmitting(true); setMessage('Submitting to judge worker...'); setResult(null)
    try {
      const { response, data } = await submitCode(token, { problemId: problem.id, roundId: round.id, language, sourceCode })
      if (!response.ok || !data.id) return setMessage(data.error || 'Submission rejected')
      setSubmissionId(data.id); setMessage('PENDING: queued for compilation and execution.')
    } catch { setMessage('Network error. Could not submit code.') } finally { setIsSubmitting(false) }
  }

  submitRef.current = () => { void handleSubmit() }

  const round = dashboard.round
  const stats = dashboard.stats
  const selectedProblem = round?.problems.find((item) => item.id === selectedProblemId) || round?.problems[0]
  const readingEndsAt = round?.readingEndsAt ? Date.parse(round.readingEndsAt) : 0
  const roundEndsAt = round?.endsAt ? Date.parse(round.endsAt) : 0
  const isReading = round?.roundType === 'CODE_IN_DARK' && Boolean(readingEndsAt) && now < readingEndsAt
  const isBlindCoding = round?.roundType === 'CODE_IN_DARK' && !isReading
  const readingSecondsLeft = isReading ? Math.ceil((readingEndsAt - now) / 1000) : 0
  const roundSecondsLeft = roundEndsAt ? Math.max(0, Math.ceil((roundEndsAt - now) / 1000)) : 0
  const isRoundOver = Boolean(roundEndsAt) && roundSecondsLeft === 0

  return <main className="participant-shell">
    <header className="participant-topbar"><div className="brand-lockup"><span className="brand-mark">◈</span><strong>CODE CLASH</strong></div>{round && <div className="participant-status"><span><span className="status-dot" /> LIVE COMPETITION</span><b>{round.name}</b></div>}<button className="icon-button" aria-label="Sign out" title="Sign out" onClick={onLogout}><LogOut size={16} /></button></header>
    <div className="participant-layout">
      <section className={round ? 'participant-content' : 'participant-content waiting-content'}>
        {!round ? <section className="participant-empty"><ShieldCheck size={24} /><div><div className="form-kicker">CONTEST STATUS</div><h1>Awaiting the next round.</h1><p>The command deck will unlock when an administrator starts a round.</p></div></section> : <>
          <section className="contest-overview"><div><div className="form-kicker">{round.roundType === 'CODE_IN_DARK' ? 'CODE IN THE DARK' : 'CODE RUN'}</div><h1>{isReading ? 'Read the problem' : isBlindCoding ? 'Code from memory' : 'The round is live'}</h1><p>{isReading ? 'The screen will blank when reading time ends.' : isBlindCoding ? 'Your screen is blank. Type your solution and submit with Ctrl+Enter.' : `${round.problems.length} question${round.problems.length === 1 ? '' : 's'} · ${round.duration} minutes`}</p></div><span className="overview-live">{isReading ? `READ ${readingSecondsLeft}s` : isRoundOver ? 'ENDED' : `${Math.floor(roundSecondsLeft / 60)}:${String(roundSecondsLeft % 60).padStart(2, '0')}`}</span></section>
          {!isBlindCoding && <section className="participant-metrics"><div><span>PROBLEMS SOLVED</span><strong>{stats?.solved ?? 0} / {stats?.totalProblems ?? round.problems.length}</strong></div><div><span>CURRENT RANK</span><strong>{stats?.rank ? `#${stats.rank}` : '--'}</strong></div><div><span>ROUND SCORE</span><strong>{stats?.score ?? 0}</strong></div><div><span>PROBLEMS ATTEMPTED</span><strong>{stats?.attempted ?? 0} / {stats?.totalProblems ?? round.problems.length}</strong></div></section>}
          <section className="participant-workspace"><div className="workspace-title"><span>{selectedProblem?.title || 'CURRENT QUESTION'}</span><div>{round.problems.length > 1 && !isBlindCoding && <select aria-label="Select question" value={selectedProblem?.id || ''} onChange={(event) => selectProblem(event.target.value)}>{round.problems.map((problem, index) => <option value={problem.id} key={problem.id}>{index + 1}. {problem.title}</option>)}</select>}<small>{language.toUpperCase()}</small><button className="workspace-action" type="button" onClick={handleSubmit} disabled={isReading || isBlindCoding || isRoundOver}>{isReading ? 'READING' : isBlindCoding ? 'SCREEN BLANK' : isRoundOver ? 'ROUND ENDED' : 'RUN CODE'}</button></div></div><div className="workspace-body">{selectedProblem ? <><ProblemView problem={selectedProblem} hidden={isBlindCoding} /><CodeEditor language={language} sourceCode={sourceCode} submissionId={submissionId} message={message} result={result} isSubmitting={isSubmitting} readOnly={Boolean(isReading) || isRoundOver} blindCoding={Boolean(isBlindCoding)} onLanguageChange={setLanguage} onSourceChange={setSourceCode} onSubmit={handleSubmit} /></> : <p className="empty-roster">No questions have been added to this round yet.</p>}</div></section>
        </>}
      </section>
    </div>
    {isBlindCoding && <div className="blind-screen-overlay" aria-hidden="true" />}
  </main>
}
