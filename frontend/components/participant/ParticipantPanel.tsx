'use client'

import { LogOut, ShieldCheck } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useContestSocket } from '../../hooks/useContestSocket'
import { useParticipantDashboard } from '../../hooks/useParticipantDashboard'
import { useActivityPing } from '../../hooks/useActivityPing'
import { getSubmissionResult, submitCode } from '../../lib/api'
import type { SubmissionResult, User } from '../../lib/types'
import { CodeEditor } from './CodeEditor'
import { ProblemView } from './ProblemView'

export function ParticipantPanel({ user, token, onLogout }: { user: User; token: string; onLogout: () => void }) {
  const { dashboard, refresh } = useParticipantDashboard(token)
  const [language, setLanguage] = useState('c')
  const [drafts, setDrafts] = useState<Record<string, string>>({})
  const [selectedProblemId, setSelectedProblemId] = useState('')
  const [problemRuns, setProblemRuns] = useState<Record<string, { submissionId: string | null; result: SubmissionResult | null; message: string }>>({})
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [now, setNow] = useState(Date.now())
  const activeRoundId = useRef<string | null>(null)
  const submissionProblemIds = useRef<Record<string, string>>({})
  const submissionPolls = useRef<Map<string, number>>(new Map())
  const submitRef = useRef<() => void>(() => {})

  const round = dashboard.round
  const stats = dashboard.stats
  const selectedProblem = round?.problems.find((item) => item.id === selectedProblemId) || round?.problems[0]
  const sourceCode = selectedProblem ? drafts[selectedProblem.id] ?? '' : ''
  const problemRun = selectedProblem ? problemRuns[selectedProblem.id] : undefined
  const submissionId = problemRun?.submissionId ?? null
  const result = problemRun?.result ?? null
  const message = problemRun?.message ?? ''

  const onResult = useCallback((data: SubmissionResult) => {
    const problemId = data.id ? submissionProblemIds.current[data.id] : undefined
    if (!problemId || !data.id) return
    submissionPolls.current.delete(data.id)
    setProblemRuns((current) => ({ ...current, [problemId]: { ...current[problemId], result: data, message: '' } }))
    refresh()
  }, [refresh])

  const pollSubmissionStatus = useCallback(async (submissionId: string, problemId: string) => {
    const check = async () => {
      try {
        const { response, data } = await getSubmissionResult(token, submissionId)
        if (!response || !data) {
          const timeoutId = window.setTimeout(() => { void check() }, 1000)
          submissionPolls.current.set(submissionId, timeoutId)
          return
        }

        const nextStatus = data.status ?? 'PENDING'
        if (nextStatus === 'PENDING') {
          const timeoutId = window.setTimeout(() => { void check() }, 1000)
          submissionPolls.current.set(submissionId, timeoutId)
          return
        }

        submissionPolls.current.delete(submissionId)
        const result: SubmissionResult = {
          id: data.id,
          status: nextStatus,
          passedCases: data.passedCases ?? 0,
          totalCases: data.totalCases ?? 0,
          compilationTime: data.compilationTime ?? null,
          executionTime: data.executionTime ?? undefined,
          maxTestCaseExecutionTime: data.maxTestCaseExecutionTime ?? null,
          error: data.error,
        }
        setProblemRuns((current) => ({ ...current, [problemId]: { ...current[problemId], result, message: '' } }))
        refresh()
      } catch {
        const timeoutId = window.setTimeout(() => { void check() }, 1000)
        submissionPolls.current.set(submissionId, timeoutId)
      }
    }

    void check()
  }, [refresh, token])

  useContestSocket(token, 'SUBMISSION_RESULT', onResult)
  useActivityPing(token)

  useEffect(() => {
    setSelectedProblemId(dashboard.round?.problems[0]?.id ?? '')
    setIsRoundFinished(false)
  }, [dashboard.round?.id])

  useEffect(() => {
    if (!dashboard.round) return
    const timer = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(timer)
  }, [dashboard.round?.id])

  activeRoundId.current = dashboard.round?.id ?? null
  const onForceSubmit = useCallback((data: { roundId: string }) => {
    if (data.roundId === activeRoundId.current) submitRef.current()
  }, [])
  useContestSocket(token, 'FORCE_SUBMIT', onForceSubmit)

  const submitCurrentRound = useCallback(() => {
    submitRef.current()
  }, [])

  useEffect(() => {
    return () => {
      for (const timerId of submissionPolls.current.values()) {
        window.clearTimeout(timerId)
      }
      submissionPolls.current.clear()
    }
  }, [])

  function selectProblem(id: string) {
    setSelectedProblemId(id)
  }

  const [isRoundFinished, setIsRoundFinished] = useState(false)
  const [fullscreenWarning, setFullscreenWarning] = useState(false)

  // Anti-cheat & Fullscreen lock
  useEffect(() => {
    if (!dashboard.round || isRoundFinished || isRoundOver) return;

    const enforceFullscreen = async () => {
      try {
        if (!document.fullscreenElement && document.documentElement.requestFullscreen) {
          await document.documentElement.requestFullscreen();
          setFullscreenWarning(false);
        }
      } catch (err) {
        setFullscreenWarning(true);
      }
    };

    void enforceFullscreen();

    const handleFullscreenChange = () => {
      if (!document.fullscreenElement && !isRoundFinished && !isRoundOver) {
        alert("⚠️ ANTI-CHEAT ALERT: You exited fullscreen mode! Your round has been forcefully submitted.");
        submitRef.current(true);
      }
    };

    const handleVisibilityChange = () => {
      if (document.hidden && !isRoundFinished && !isRoundOver) {
        alert("⚠️ ANTI-CHEAT ALERT: You switched tabs or minimized the window! Your round has been forcefully submitted.");
        submitRef.current(true);
      }
    };

    document.addEventListener('fullscreenchange', handleFullscreenChange);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [dashboard.round?.id, isRoundFinished, isRoundOver]);

  async function submitSingleProblem(problemId: string, code: string) {
    const round = dashboard.round
    const problem = round?.problems.find((item) => item.id === problemId)
    if (!round || !problem || !code.trim()) return

    setProblemRuns((current) => ({ ...current, [problem.id]: { ...current[problem.id], message: 'Submitting to judge worker...', result: null } }))
    try {
      const { response, data } = await submitCode(token, { problemId: problem.id, roundId: round.id, language, sourceCode: code })
      if (!response.ok || !data.id) {
        setProblemRuns((current) => ({ ...current, [problem.id]: { ...current[problem.id], message: data.error || 'Submission rejected' } }))
        return
      }
      submissionProblemIds.current[data.id] = problem.id
      setProblemRuns((current) => ({ ...current, [problem.id]: { submissionId: data.id!, result: null, message: 'PENDING: queued for compilation and execution.' } }))
      void pollSubmissionStatus(data.id, problem.id)
    } catch {
      setProblemRuns((current) => ({ ...current, [problem.id]: { ...current[problem.id], message: 'Network error. Could not submit code.' } }))
    }
  }

  async function handleSubmit(problemId = selectedProblemId) {
    if (isSubmitting || isRoundFinished) return
    const round = dashboard.round
    const problem = round?.problems.find((item) => item.id === problemId)
    const code = problem ? drafts[problem.id] ?? '' : ''
    if (!round || !problem || !code.trim()) {
      if (problem) setProblemRuns((current) => ({ ...current, [problem.id]: { ...current[problem.id], message: 'Write code before submitting.' } }))
      return
    }
    setIsSubmitting(true)
    await submitSingleProblem(problemId, code)
    setIsSubmitting(false)
  }

  submitRef.current = (forceCheat = false) => {
    if (isSubmitting || isRoundFinished) return
    const problemIds = round?.problems.filter((problem) => drafts[problem.id]?.trim()).map((problem) => problem.id) ?? []
    if (problemIds.length === 0 && !forceCheat) {
      alert("You haven't written any code yet!")
      return
    }
    setIsSubmitting(true)
    void (async () => { 
      for (const problemId of problemIds) {
        await submitSingleProblem(problemId, drafts[problemId]!)
      }
      setIsSubmitting(false)
      setIsRoundFinished(true)
      if (document.fullscreenElement) {
        document.exitFullscreen().catch(() => {});
      }
    })()
  }

  const readingEndsAt = round?.readingEndsAt ? Date.parse(round.readingEndsAt) : 0
  const roundEndsAt = round?.endsAt ? Date.parse(round.endsAt) : 0
  const isReading = round?.roundType === 'CODE_IN_DARK' && Boolean(readingEndsAt) && now < readingEndsAt
  const isBlindCoding = round?.roundType === 'CODE_IN_DARK' && !isReading
  const readingSecondsLeft = isReading ? Math.ceil((readingEndsAt - now) / 1000) : 0
  const roundSecondsLeft = roundEndsAt ? Math.max(0, Math.ceil((roundEndsAt - now) / 1000)) : 0
  const isRoundOver = Boolean(roundEndsAt) && roundSecondsLeft === 0

  return <main className="participant-shell">
    {fullscreenWarning && !isRoundFinished && !isRoundOver && round && (
      <div 
        onClick={() => {
          document.documentElement.requestFullscreen().then(() => setFullscreenWarning(false)).catch(() => {});
        }}
        style={{ position: 'fixed', inset: 0, zIndex: 9999, background: 'rgba(0,0,0,0.9)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: '#fff', textAlign: 'center', cursor: 'pointer' }}
      >
        <ShieldCheck size={64} style={{ color: 'var(--brand-gold)', marginBottom: '20px' }} />
        <h1 style={{ fontSize: '32px', marginBottom: '10px' }}>ENTER FULLSCREEN TO BEGIN</h1>
        <p style={{ fontSize: '18px', color: '#ccc' }}>Click anywhere on the screen to enter full-screen mode and start the round.</p>
      </div>
    )}
    <header className="participant-topbar"><div className="brand-lockup"><span className="brand-mark">◈</span><strong>CODE CLASH</strong></div>{round && <div className="participant-status"><span><span className="status-dot" /> LIVE COMPETITION</span><b>{round.name}</b></div>}<button className="icon-button" aria-label="Sign out" title="Sign out" onClick={onLogout}><LogOut size={16} /></button></header>
    <div className="participant-layout">
      <section className={round && !(isRoundFinished || isRoundOver) ? 'participant-content' : 'participant-content waiting-content'}>
        {!round ? <section className="participant-empty"><ShieldCheck size={24} /><div><div className="form-kicker">CONTEST STATUS</div><h1>Awaiting the next round.</h1><p>The command deck will unlock when an administrator starts a round.</p></div></section> : isRoundFinished || isRoundOver ? (
          <section className="participant-empty">
            <ShieldCheck size={48} style={{ color: 'var(--brand-gold)', marginBottom: '1rem' }} />
            <div style={{ textAlign: 'center' }}>
              <div className="form-kicker">ROUND COMPLETED</div>
              <h1 style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>Your round is submitted</h1>
              <p style={{ color: 'var(--text-muted)' }}>Now wait for the second round.</p>
              <div style={{ marginTop: '2rem', padding: '1.5rem', background: 'var(--surface-sunken)', borderRadius: '12px', border: '1px solid var(--border-color)' }}>
                <div style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '0.25rem' }}>FINAL SCORE</div>
                <div style={{ fontSize: '3rem', fontWeight: 800, color: 'var(--brand-gold)', lineHeight: 1 }}>{stats?.score ?? 0}</div>
                <div style={{ marginTop: '1rem', display: 'flex', gap: '2rem', justifyContent: 'center' }}>
                  <div><div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>SOLVED</div><strong style={{ fontSize: '1.25rem' }}>{stats?.solved ?? 0} / {stats?.totalProblems ?? round.problems.length}</strong></div>
                  <div><div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>RANK</div><strong style={{ fontSize: '1.25rem' }}>{stats?.rank ? `#${stats.rank}` : '--'}</strong></div>
                </div>
              </div>
            </div>
          </section>
        ) : <>
          <section className="contest-overview"><div><div className="form-kicker">{round.roundType === 'CODE_IN_DARK' ? 'CODE IN THE DARK' : 'CODE RUN'}</div><h1>{isReading ? 'Read the problems' : isBlindCoding ? 'Code from memory' : 'The round is live'}</h1><p>{isReading ? 'The screen will blank when reading time ends.' : isBlindCoding ? 'Your screen is blank. Type your solution and submit with Ctrl+Enter.' : `${round.problems.length} coding problem${round.problems.length === 1 ? '' : 's'} · ${round.duration} minutes`}</p></div><div className="overview-actions"><button className="gold-button" type="button" onClick={submitCurrentRound} disabled={isReading || isBlindCoding || isRoundOver || isSubmitting || isRoundFinished}>{isRoundFinished ? 'ROUND SUBMITTED' : isSubmitting ? 'SUBMITTING...' : 'SUBMIT ROUND'}</button><span className="overview-live">{isReading ? `READ ${readingSecondsLeft}s` : isRoundOver ? 'ENDED' : `${Math.floor(roundSecondsLeft / 60)}:${String(roundSecondsLeft % 60).padStart(2, '0')}`}</span></div></section>
          {round.problems.length > 1 && !isBlindCoding && <nav className="participant-problem-selector" aria-label="Problems in this round"><span>PROBLEMS</span>{round.problems.map((problem, index) => <button className={problem.id === selectedProblem?.id ? 'active' : ''} type="button" key={problem.id} onClick={() => selectProblem(problem.id)}><b>{String(index + 1).padStart(2, '0')}</b><span>{problem.title}</span><small>{problem.points ?? 0} PTS</small></button>)}</nav>}
          {!isBlindCoding && <section className="participant-metrics"><div><span>PROBLEMS SOLVED</span><strong>{stats?.solved ?? 0} / {stats?.totalProblems ?? round.problems.length}</strong></div><div><span>PROBLEMS ATTEMPTED</span><strong>{stats?.attempted ?? 0} / {stats?.totalProblems ?? round.problems.length}</strong></div></section>}
          <section className="participant-workspace"><div className="workspace-title"><span>{selectedProblem?.title || 'CURRENT PROBLEM'}</span><div><small>{language.toUpperCase()}</small></div></div><div className="workspace-body">{selectedProblem ? <><ProblemView problem={selectedProblem} hidden={isBlindCoding} /><CodeEditor language={language} sourceCode={sourceCode} submissionId={submissionId} message={message} result={result} isSubmitting={isSubmitting || isRoundFinished} readOnly={Boolean(isReading) || isRoundOver || isRoundFinished} blindCoding={Boolean(isBlindCoding)} onLanguageChange={setLanguage} onSourceChange={(code) => setDrafts((current) => ({ ...current, [selectedProblem.id]: code }))} onSubmit={() => { void handleSubmit() }} /></> : <p className="empty-roster">No coding problems have been added to this round yet.</p>}</div></section>
        </>}
      </section>
    </div>
    {isBlindCoding && <div className="blind-screen-overlay" aria-hidden="true" />}
  </main>
}
