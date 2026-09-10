'use client'

import { LogOut, ShieldCheck } from 'lucide-react'
import { useCallback, useState } from 'react'
import { useAssignment } from '../../hooks/useAssignment'
import { useContestSocket } from '../../hooks/useContestSocket'
import { submitCode } from '../../lib/api'
import type { SubmissionResult, User } from '../../lib/types'
import { CodeEditor } from './CodeEditor'
import { ProblemView } from './ProblemView'

export function ParticipantPanel({ user, token, onLogout }: { user: User; token: string; onLogout: () => void }) {
  const assignment = useAssignment(token)
  const [language, setLanguage] = useState('javascript')
  const [sourceCode, setSourceCode] = useState('')
  const [submissionId, setSubmissionId] = useState<string | null>(null)
  const [result, setResult] = useState<SubmissionResult | null>(null)
  const [message, setMessage] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const onResult = useCallback((data: SubmissionResult) => { setResult(data); setMessage('') }, [])
  useContestSocket(token, 'SUBMISSION_RESULT', onResult)

  async function handleSubmit() {
    if (isSubmitting) return
    const problem = assignment?.problems[0]
    if (!assignment || !problem || !sourceCode.trim()) return setMessage('Write code before submitting.')
    setIsSubmitting(true); setMessage('Submitting to judge worker...'); setResult(null)
    try {
      const { response, data } = await submitCode(token, { problemId: problem.id, roundId: assignment.id, language, sourceCode })
      if (!response.ok || !data.id) return setMessage(data.error || 'Submission rejected')
      setSubmissionId(data.id); setMessage('PENDING: queued for compilation and execution.')
    } catch { setMessage('Network error. Could not submit code.') } finally { setIsSubmitting(false) }
  }

  return <main className="dashboard-shell"><header className="dashboard-header"><div><div className="form-kicker">CODE CLASH // PARTICIPANT</div><h1>Welcome aboard, {user.name}.</h1><p>Your authenticated contest station is ready.</p></div><button className="outline-button" onClick={onLogout}><LogOut size={15} /> SIGN OUT</button></header><section className="judge-workspace">{!assignment?.problems[0] ? <div className="dashboard-card"><ShieldCheck size={22} /><div><div className="form-kicker">JUDGE PIPELINE</div><h2>No active assignment</h2><p>When an admin starts a round, your problem and judge limits will appear here.</p></div></div> : <><ProblemView problem={assignment.problems[0]} /><CodeEditor language={language} sourceCode={sourceCode} submissionId={submissionId} message={message} result={result} isSubmitting={isSubmitting} onLanguageChange={setLanguage} onSourceChange={setSourceCode} onSubmit={handleSubmit} /></>}</section></main>
}
