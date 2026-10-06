'use client'

import { useEffect, useState, type ReactNode } from 'react'
import { ArrowDown, ArrowUp, Check, ClipboardList, Compass, Copy, Database, Gavel, Lock, Plus, Save, Trash2, Upload } from 'lucide-react'
import { adminFetch, adminMutate } from '../../lib/api'
import type { AdminProblem, AdminRound, AdminTestCase, Problem, ProblemExample } from '../../lib/types'
import { useContestSocket } from '../../hooks/useContestSocket'
import { ProblemView } from '../participant/ProblemView'

type Page = 'rounds' | 'problems'
type Notice = { kind: 'success' | 'error'; text: string } | null
type ProblemDetails = AdminProblem & { testCases: AdminTestCase[]; examples: ProblemExample[] }
type ProblemDraft = {
  title: string
  description: string
  inputFormat: string
  outputFormat: string
  constraints: string
  difficulty: 'EASY' | 'MEDIUM' | 'HARD'
  timeLimit: string
  memoryLimit: string
  points: string
  roundId: string
}
type ImportProblem = Omit<ProblemDraft, 'timeLimit' | 'memoryLimit' | 'points'> & {
  timeLimit: number
  memoryLimit: number
  points: number
  examples: Array<{ input: string; output: string; explanation?: string }>
  testCases: Array<{ input: string; output: string; isHidden?: boolean }>
}

const emptyProblem: ProblemDraft = {
  title: '', description: '', inputFormat: '', outputFormat: '', constraints: '',
  difficulty: 'MEDIUM', timeLimit: '1000', memoryLimit: '256', points: '100', roundId: '',
}

function errorMessage(data: unknown, fallback: string) {
  if (data && typeof data === 'object' && 'error' in data && typeof data.error === 'string') return data.error
  return fallback
}

function lineCount(value: string) {
  return Math.max(1, value.split(/\r?\n/).length)
}

function coerceArray<T>(value: unknown): T[] {
  if (Array.isArray(value)) return value as T[]
  if (value && typeof value === 'object') {
    for (const key of ['items', 'data', 'rounds', 'problems']) {
      const candidate = (value as Record<string, unknown>)[key]
      if (Array.isArray(candidate)) return candidate as T[]
    }
  }
  return []
}

export function ContestSetup({ token, page, onNavigate, notify }: {
  token: string
  page: Page
  onNavigate: (page: Page) => void
  notify: (notice: Notice) => void
}) {
  const [rounds, setRounds] = useState<AdminRound[]>([])
  const [problems, setProblems] = useState<AdminProblem[]>([])
  const [selectedRoundId, setSelectedRoundId] = useState('')
  const [selectedProblemId, setSelectedProblemId] = useState('')
  const [creatingProblem, setCreatingProblem] = useState(false)
  const [problemDetails, setProblemDetails] = useState<ProblemDetails | null>(null)
  const [loading, setLoading] = useState(true)
  const [roundType, setRoundType] = useState<'CODE_RUN' | 'CODE_IN_DARK'>('CODE_RUN')
  const [roundDuration, setRoundDuration] = useState('60')
  const [readingPeriodSeconds, setReadingPeriodSeconds] = useState('180')
  const [autoSubmitOnEnd, setAutoSubmitOnEnd] = useState(true)
  const [problemDraft, setProblemDraft] = useState<ProblemDraft>(emptyProblem)
  const [exampleDraft, setExampleDraft] = useState({ input: '', output: '', explanation: '' })
  const [editingExampleId, setEditingExampleId] = useState('')
  const [testCaseDraft, setTestCaseDraft] = useState({ input: '', output: '', isHidden: true })
  const [editingTestCaseId, setEditingTestCaseId] = useState('')
  const [duplicateRoundId, setDuplicateRoundId] = useState('')
  const [importText, setImportText] = useState('')
  const [importPreview, setImportPreview] = useState<ImportProblem[] | null>(null)
  const [importError, setImportError] = useState('')

  const selectedRound = rounds.find((round) => round.id === selectedRoundId) ?? null
  const selectedProblem = problems.find((problem) => problem.id === selectedProblemId) ?? null
  const roundProblems = selectedRound ? problems.filter((problem) => problem.roundId === selectedRound.id).sort((first, second) => first.position - second.position) : []
  const roundProblem = selectedRound && selectedProblem?.roundId === selectedRound.id ? selectedProblem : null
  const locked = !selectedRound || selectedRound.status !== 'PENDING'
  const pendingRounds = rounds.filter((round) => round.status === 'PENDING')

  async function refreshProblem(id: string) {
    const { response, data } = await adminFetch<ProblemDetails>(token, `/problems/${id}`)
    if (response.ok && data) setProblemDetails(data)
    return response.ok
  }

  async function load() {
    setLoading(true)
    const [roundResult, problemResult] = await Promise.all([
      adminFetch<AdminRound[]>(token, '/rounds'),
      adminFetch<AdminProblem[]>(token, '/problems'),
    ])
    const nextRounds = coerceArray<AdminRound>(roundResult.data)
    const nextProblems = coerceArray<AdminProblem>(problemResult.data)
    setRounds(nextRounds)
    setProblems(nextProblems)
    setSelectedRoundId((current) => current && nextRounds.some((round) => round.id === current)
      ? current
      : nextRounds.find((round) => round.status === 'PENDING')?.id ?? nextRounds[0]?.id ?? '')
    setLoading(false)
  }

  useEffect(() => { void load() }, [token])
  useContestSocket(token, 'ROUND_STATE_UPDATE', () => { void load() })

  useEffect(() => {
    if (!selectedRound) return
    setRoundDuration(String(selectedRound.duration))
    setReadingPeriodSeconds(String(selectedRound.readingPeriodSeconds))
    setAutoSubmitOnEnd(selectedRound.autoSubmitOnEnd)
    const roundProblems = problems.filter((problem) => problem.roundId === selectedRound.id).sort((first, second) => first.position - second.position)
    const attached = roundProblems.find((problem) => problem.id === selectedProblemId) ?? roundProblems[0]
    if (!attached && !creatingProblem) setSelectedProblemId('')
    if (!attached || creatingProblem) {
      setProblemDraft({ ...emptyProblem, roundId: selectedRound.id })
      return
    }
    setSelectedProblemId(attached.id)
    setProblemDraft({
      title: attached.title, description: attached.description, inputFormat: attached.inputFormat,
      outputFormat: attached.outputFormat, constraints: attached.constraints ?? '',
      difficulty: attached.difficulty as ProblemDraft['difficulty'], timeLimit: String(attached.timeLimit),
      memoryLimit: String(attached.memoryLimit), points: String(attached.points ?? 100), roundId: attached.roundId,
    })
  }, [selectedRoundId, selectedProblemId, creatingProblem, rounds, problems])

  useEffect(() => {
    let cancelled = false
    if (!selectedProblemId) {
      setProblemDetails(null)
      setDuplicateRoundId('')
      return
    }
    void adminFetch<ProblemDetails>(token, `/problems/${selectedProblemId}`).then(({ response, data }) => {
      if (!cancelled && response.ok && data) {
        setProblemDetails(data)
        setProblemDraft({
          title: data.title, description: data.description, inputFormat: data.inputFormat,
          outputFormat: data.outputFormat, constraints: data.constraints ?? '',
          difficulty: data.difficulty as ProblemDraft['difficulty'], timeLimit: String(data.timeLimit),
          memoryLimit: String(data.memoryLimit), points: String(data.points), roundId: data.roundId,
        })
        setDuplicateRoundId(rounds.find((round) => round.status === 'PENDING')?.id ?? '')
      }
    })
    return () => { cancelled = true }
  }, [token, selectedProblemId, rounds, problems])

  function selectRound(id: string) {
    setSelectedRoundId(id)
    const attached = problems.filter((problem) => problem.roundId === id).sort((first, second) => first.position - second.position)[0]
    setSelectedProblemId(attached?.id ?? '')
    setCreatingProblem(false)
    setProblemDetails(null)
    setProblemDraft({ ...emptyProblem, roundId: id })
  }

  function selectProblem(id: string) {
    setCreatingProblem(false)
    setSelectedProblemId(id)
  }

  function startNewProblem() {
    if (!selectedRound || locked) return
    setCreatingProblem(true)
    setSelectedProblemId('')
    setProblemDetails(null)
    setProblemDraft({ ...emptyProblem, roundId: selectedRound.id })
    setEditingExampleId('')
    setEditingTestCaseId('')
  }

  async function createRound(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const body = {
      roundType,
      duration: Number(roundDuration),
      readingPeriodSeconds: roundType === 'CODE_IN_DARK' ? Number(readingPeriodSeconds) : 0,
      autoSubmitOnEnd,
    }
    const { response, data } = await adminMutate<AdminRound & { error?: string }>(token, '/rounds', 'POST', body)
    if (!response.ok) return notify({ kind: 'error', text: errorMessage(data, 'Could not create round.') })
    notify({ kind: 'success', text: `${data?.name || 'Round'} created.` })
    await load()
    if (data?.id) setSelectedRoundId(data.id)
  }

  async function updateRound(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!selectedRound || locked) return
    const { response, data } = await adminMutate<AdminRound>(token, `/rounds/${selectedRound.id}`, 'PUT', {
      duration: Number(roundDuration),
      readingPeriodSeconds: selectedRound.roundType === 'CODE_IN_DARK' ? Number(readingPeriodSeconds) : 0,
      autoSubmitOnEnd,
    })
    if (!response.ok) return notify({ kind: 'error', text: errorMessage(data, 'Could not update round configuration.') })
    notify({ kind: 'success', text: 'Round configuration saved.' })
    await load()
  }

  async function resetRound(round: AdminRound) {
    if (!window.confirm(`Reset ${round.name}? The round returns to PENDING.`)) return
    const { response, data } = await adminMutate<AdminRound & { error?: string }>(token, `/rounds/${round.id}/reset`, 'POST')
    if (!response.ok) return notify({ kind: 'error', text: errorMessage(data, 'Could not reset round.') })
    notify({ kind: 'success', text: `${round.name} reset.` })
    await load()
  }

  async function deleteRound(round: AdminRound) {
    if (!window.confirm(`Delete ${round.name}? This also removes its problem, examples, and test cases.`)) return
    const { response, data } = await adminMutate<null & { error?: string }>(token, `/rounds/${round.id}`, 'DELETE')
    if (!response.ok) return notify({ kind: 'error', text: errorMessage(data, 'Could not delete round.') })
    notify({ kind: 'success', text: `${round.name} deleted.` })
    setSelectedRoundId('')
    await load()
  }

  async function saveProblem(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (locked || !selectedRound) return
    const body = {
      ...problemDraft,
      roundId: selectedRound.id,
      timeLimit: Number(problemDraft.timeLimit),
      memoryLimit: Number(problemDraft.memoryLimit),
      points: Number(problemDraft.points),
    }
    const editing = Boolean(roundProblem)
    const { response, data } = editing
      ? await adminMutate<AdminProblem & { error?: string }>(token, `/problems/${roundProblem!.id}`, 'PUT', body)
      : await adminMutate<AdminProblem & { error?: string }>(token, '/problems', 'POST', body)
    if (!response.ok) return notify({ kind: 'error', text: errorMessage(data, 'Could not save coding problem.') })
    if (data?.id) setSelectedProblemId(data.id)
    setCreatingProblem(false)
    notify({ kind: 'success', text: editing ? 'Coding problem updated.' : 'Coding problem created.' })
    await load()
  }

  async function deleteProblem() {
    if (!roundProblem || locked) return
    if (!window.confirm(`Delete "${roundProblem.title}" and all its examples and judge test cases?`)) return
    const { response, data } = await adminMutate<null & { error?: string }>(token, `/problems/${roundProblem.id}`, 'DELETE')
    if (!response.ok) return notify({ kind: 'error', text: errorMessage(data, 'Could not delete coding problem.') })
    notify({ kind: 'success', text: 'Coding problem deleted.' })
    const nextProblem = roundProblems.find((problem) => problem.id !== roundProblem.id)
    setSelectedProblemId(nextProblem?.id ?? '')
    setCreatingProblem(false)
    await load()
  }

  async function duplicateProblem() {
    if (!roundProblem || !duplicateRoundId || locked) return
    const destination = rounds.find((round) => round.id === duplicateRoundId)
    if (!window.confirm(`Duplicate "${roundProblem.title}" into ${destination?.name}? Examples and judge cases will be copied.`)) return
    const { response, data } = await adminMutate<AdminProblem & { error?: string }>(token, `/problems/${roundProblem.id}/duplicate`, 'POST', { roundId: duplicateRoundId })
    if (!response.ok) return notify({ kind: 'error', text: errorMessage(data, 'Could not duplicate coding problem.') })
    notify({ kind: 'success', text: 'Coding problem duplicated with examples and judge cases.' })
    await load()
    if (data?.roundId) selectRound(data.roundId)
  }

  async function saveExample(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!roundProblem || locked) return
    const path = editingExampleId
      ? `/problems/${roundProblem.id}/examples/${editingExampleId}`
      : `/problems/${roundProblem.id}/examples`
    const { response, data } = await adminMutate<ProblemExample & { error?: string }>(token, path, editingExampleId ? 'PUT' : 'POST', exampleDraft)
    if (!response.ok) return notify({ kind: 'error', text: errorMessage(data, 'Could not save example.') })
    setEditingExampleId('')
    setExampleDraft({ input: '', output: '', explanation: '' })
    notify({ kind: 'success', text: editingExampleId ? 'Example updated.' : 'Example added.' })
    await refreshProblem(roundProblem.id)
    await load()
  }

  async function deleteExample(example: ProblemExample) {
    if (!roundProblem || locked || !window.confirm(`Delete example ${problemDetails?.examples?.findIndex((item) => item.id === example.id)! + 1}?`)) return
    const { response, data } = await adminMutate<null & { error?: string }>(token, `/problems/${roundProblem.id}/examples/${example.id}`, 'DELETE')
    if (!response.ok) return notify({ kind: 'error', text: errorMessage(data, 'Could not delete example.') })
    notify({ kind: 'success', text: 'Example deleted.' })
    await refreshProblem(roundProblem.id)
    await load()
  }

  async function moveExample(index: number, offset: -1 | 1) {
    if (!roundProblem || locked || !problemDetails) return
    const examples = [...problemDetails.examples]
    const targetIndex = index + offset
    if (targetIndex < 0 || targetIndex >= examples.length) return
    ;[examples[index], examples[targetIndex]] = [examples[targetIndex], examples[index]]
    const { response, data } = await adminMutate<null & { error?: string }>(token, `/problems/${roundProblem.id}/examples/reorder`, 'PUT', { ids: examples.map((example) => example.id) })
    if (!response.ok) return notify({ kind: 'error', text: errorMessage(data, 'Could not reorder examples.') })
    await refreshProblem(roundProblem.id)
  }

  async function moveProblem(index: number, offset: -1 | 1) {
    if (!selectedRound || locked) return
    const ordered = [...roundProblems]
    const targetIndex = index + offset
    if (targetIndex < 0 || targetIndex >= ordered.length) return
    ;[ordered[index], ordered[targetIndex]] = [ordered[targetIndex], ordered[index]]
    const { response, data } = await adminMutate<null & { error?: string }>(token, `/rounds/${selectedRound.id}/problems/reorder`, 'PUT', { ids: ordered.map((problem) => problem.id) })
    if (!response.ok) return notify({ kind: 'error', text: errorMessage(data, 'Could not reorder problems.') })
    await load()
  }

  async function saveTestCase(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!roundProblem || locked) return
    const path = editingTestCaseId
      ? `/problems/${roundProblem.id}/test-cases/${editingTestCaseId}`
      : `/problems/${roundProblem.id}/test-cases`
    const { response, data } = await adminMutate<AdminTestCase & { error?: string }>(token, path, editingTestCaseId ? 'PUT' : 'POST', testCaseDraft)
    if (!response.ok) return notify({ kind: 'error', text: errorMessage(data, 'Could not save judge test case.') })
    setEditingTestCaseId('')
    setTestCaseDraft({ input: '', output: '', isHidden: true })
    notify({ kind: 'success', text: editingTestCaseId ? 'Judge test case updated.' : 'Judge test case added.' })
    await refreshProblem(roundProblem.id)
    await load()
  }

  async function toggleTestCase(testCase: AdminTestCase) {
    if (!roundProblem || locked) return
    const { response, data } = await adminMutate<AdminTestCase & { error?: string }>(token, `/problems/${roundProblem.id}/test-cases/${testCase.id}`, 'PUT', { isHidden: !testCase.isHidden })
    if (!response.ok) return notify({ kind: 'error', text: errorMessage(data, 'Could not change test case visibility.') })
    await refreshProblem(roundProblem.id)
    await load()
  }

  async function deleteTestCase(testCase: AdminTestCase) {
    if (!roundProblem || locked || !window.confirm(`Delete this ${testCase.isHidden ? 'hidden' : 'public'} judge test case?`)) return
    const { response, data } = await adminMutate<null & { error?: string }>(token, `/problems/${roundProblem.id}/test-cases/${testCase.id}`, 'DELETE')
    if (!response.ok) return notify({ kind: 'error', text: errorMessage(data, 'Could not delete judge test case.') })
    notify({ kind: 'success', text: 'Judge test case deleted.' })
    await refreshProblem(roundProblem.id)
    await load()
  }

  async function duplicateTestCase(testCase: AdminTestCase) {
    if (!roundProblem || locked) return
    const { response, data } = await adminMutate<AdminTestCase & { error?: string }>(token, `/problems/${roundProblem.id}/test-cases/${testCase.id}/duplicate`, 'POST')
    if (!response.ok) return notify({ kind: 'error', text: errorMessage(data, 'Could not duplicate judge test case.') })
    notify({ kind: 'success', text: 'Judge test case duplicated.' })
    await refreshProblem(roundProblem.id)
    await load()
  }

  function validateImport() {
    setImportError('')
    setImportPreview(null)
    try {
      const parsed: unknown = JSON.parse(importText)
      if (!Array.isArray(parsed) || parsed.length < 1) throw new Error('Provide an array with at least one coding problem.')
      const errors: string[] = []
      parsed.forEach((value, index) => {
        if (!value || typeof value !== 'object' || Array.isArray(value)) {
          errors.push(`Item ${index + 1}: expected a problem object.`)
          return
        }
        const item = value as Record<string, unknown>
        for (const field of ['title', 'description', 'inputFormat', 'outputFormat', 'constraints', 'roundId']) {
          if (typeof item[field] !== 'string' || !item[field].trim()) errors.push(`Item ${index + 1}: ${field} is required.`)
        }
        if (!['EASY', 'MEDIUM', 'HARD'].includes(String(item.difficulty))) errors.push(`Item ${index + 1}: difficulty must be EASY, MEDIUM, or HARD.`)
        for (const field of ['timeLimit', 'memoryLimit', 'points']) {
          if (!Number.isInteger(item[field]) || Number(item[field]) <= 0) errors.push(`Item ${index + 1}: ${field} must be a positive integer.`)
        }
        const target = rounds.find((round) => round.id === item.roundId && round.status === 'PENDING')
        if (!target) errors.push(`Item ${index + 1}: roundId must reference a pending round.`)
        if (!Array.isArray(item.examples) || item.examples.length === 0) errors.push(`Item ${index + 1}: add at least one public example.`)
        if (!Array.isArray(item.testCases) || item.testCases.length === 0) errors.push(`Item ${index + 1}: add judge test cases.`)
        else if (!item.testCases.some((testCase) => testCase && typeof testCase === 'object' && 'isHidden' in testCase && testCase.isHidden === true)) errors.push(`Item ${index + 1}: include at least one hidden judge test case.`)
      })
      if (errors.length) throw new Error(errors.join(' '))
      setImportPreview(parsed as ImportProblem[])
    } catch (error) {
      setImportError(error instanceof Error ? error.message : 'Invalid JSON import.')
    }
  }

  async function importProblems() {
    if (!importPreview || !window.confirm(`Import ${importPreview.length} coding problem(s) into their selected pending rounds?`)) return
    const { response, data } = await adminMutate<AdminProblem[] & { error?: string }>(token, '/problems/import', 'POST', { problems: importPreview })
    if (!response.ok) return setImportError(errorMessage(data, 'Bulk import failed.'))
    notify({ kind: 'success', text: `${data?.length ?? importPreview.length} coding problem(s) imported.` })
    setImportText('')
    setImportPreview(null)
    await load()
  }

  const previewProblem: Problem = {
    id: selectedProblemId || 'preview',
    ...problemDraft,
    timeLimit: Number(problemDraft.timeLimit) || 0,
    memoryLimit: Number(problemDraft.memoryLimit) || 0,
    points: Number(problemDraft.points) || 0,
    examples: problemDetails?.examples ?? [],
  }

  return <div className={`contest-setup-page contest-setup-${page}`}>
    {page === 'rounds' ? <>
      <section className="admin-section round-create-section">
        <div className="workflow-section-heading"><div><div className="form-kicker">CONTEST CONFIGURATION</div><h3>Create a round</h3></div><Gavel size={20} /></div>
        <form className="round-create-form" onSubmit={(event) => void createRound(event)}>
          <label><span>Round type</span><select value={roundType} onChange={(event) => setRoundType(event.target.value as 'CODE_RUN' | 'CODE_IN_DARK')}><option value="CODE_RUN" disabled={rounds.some((round) => round.roundType === 'CODE_RUN' && round.status !== 'ENDED')}>Code Run</option><option value="CODE_IN_DARK" disabled={rounds.some((round) => round.roundType === 'CODE_IN_DARK' && round.status !== 'ENDED')}>Code in the Dark</option></select></label>
          <label><span>Duration (minutes)</span><input type="number" min="1" max="360" value={roundDuration} onChange={(event) => setRoundDuration(event.target.value)} required /></label>
          {roundType === 'CODE_IN_DARK' && <label><span>Reading period (seconds)</span><input type="number" min="30" max="600" value={readingPeriodSeconds} onChange={(event) => setReadingPeriodSeconds(event.target.value)} required /></label>}
          <label className="admin-checkbox"><input type="checkbox" checked={autoSubmitOnEnd} onChange={(event) => setAutoSubmitOnEnd(event.target.checked)} /><span>Auto-submit when the round ends</span></label>
          <button className="gold-button" type="submit" disabled={rounds.some((round) => round.roundType === roundType && round.status !== 'ENDED')}><Plus size={15} /> Create round</button>
        </form>
      </section>

      <section className="round-management-grid">
        <div className="admin-section round-list-section">
          <div className="workflow-section-heading"><div><div className="form-kicker">VOYAGE MANAGEMENT</div><h3>Voyages</h3></div><span className="round-count">{rounds.length}</span></div>
          {loading ? <div className="loading-state"><Compass className="compass-icon" size={24} /> <span>Mapping the voyages...</span></div> : rounds.length ? <div className="round-card-list">{rounds.map((round) => {
            const attached = problems.filter((problem) => problem.roundId === round.id).sort((first, second) => first.position - second.position)
            return <button type="button" className={round.id === selectedRoundId ? 'round-card selected' : 'round-card'} key={round.id} onClick={() => selectRound(round.id)}>
              <span className="round-card-top"><strong>{round.name}</strong><b className={`round-status status-${round.status.toLowerCase()}`}>{round.status}</b></span>
              <span className="round-card-meta">{round.duration} min{round.roundType === 'CODE_IN_DARK' ? ` · ${round.readingPeriodSeconds}s reading` : ''}</span>
              <span className={attached.length ? 'round-problem configured' : 'round-problem'}>{attached.length ? <><Check size={14} /> {attached.length} problem{attached.length === 1 ? '' : 's'} · {attached.reduce((sum, problem) => sum + problem.points, 0)} pts available</> : 'No coding problems configured'}</span>
              <span className={round.readiness?.ready ? 'round-readiness ready' : 'round-readiness'}>{round.readiness?.ready ? 'READY' : `${round.readiness?.missing.length ?? 0} setup items remaining`}</span>
            </button>
          })}</div> : <p className="empty-roster">No rounds created yet.</p>}
        </div>

        {selectedRound && <section className="admin-section round-detail-section">
          <div className="workflow-section-heading"><div><div className="form-kicker">ROUND CONFIGURATION</div><h3>{selectedRound.name}</h3></div><b className={`round-status status-${selectedRound.status.toLowerCase()}`}>{selectedRound.status}</b></div>
          <div className="round-detail-stats"><div><span>DURATION</span><strong>{selectedRound.duration} min</strong></div><div><span>READING PERIOD</span><strong>{selectedRound.roundType === 'CODE_IN_DARK' ? `${selectedRound.readingPeriodSeconds}s` : 'Not used'}</strong></div><div><span>AUTO-SUBMIT</span><strong>{selectedRound.autoSubmitOnEnd ? 'On' : 'Off'}</strong></div></div>
          <div className="round-problem-summary"><span>CODING PROBLEMS · {roundProblems.length}</span>{roundProblems.length ? <ol className="round-problem-list">{roundProblems.map((problem, index) => <li key={problem.id}><button type="button" onClick={() => { setCreatingProblem(false); setSelectedProblemId(problem.id); onNavigate('problems') }}><strong>{index + 1}. {problem.title}</strong><small>{problem.points} pts · {problem.exampleCount ?? 0} examples · {problem.testCaseCount ?? 0} judge tests</small></button></li>)}</ol> : <strong>Not configured</strong>}<button className="mini-button" type="button" onClick={() => { startNewProblem(); onNavigate('problems') }}>+ Add coding problem</button></div>
          <div className="readiness-panel"><div className="workflow-section-heading"><div><div className="form-kicker">PRE-FLIGHT CHECK</div><h3>Round readiness</h3></div><b className={selectedRound.readiness?.ready ? 'readiness-badge ready' : 'readiness-badge'}>{selectedRound.readiness?.ready ? 'READY' : 'NEEDS SETUP'}</b></div>
            <ul>{selectedRound.readiness?.checks.map((check) => <li key={check.key} className={check.ready ? 'check-ready' : 'check-missing'}>{check.ready || check.key === 'round-order' ? <span className="check-icon">{check.ready ? '✓' : '!'}</span> : <button type="button" className="check-button" onClick={() => { const problemIndex = Number(check.key.match(/^problem-(\d+)-/)?.[1]) - 1; const target = Number.isInteger(problemIndex) && problemIndex >= 0 ? roundProblems[problemIndex] : undefined; if (target) { setCreatingProblem(false); setSelectedProblemId(target.id) } else startNewProblem(); onNavigate('problems') }}>!</button>}<span className="check-label">{check.label}</span></li>)}</ul>
          </div>
          <details className="round-edit-details" open={selectedRound.status === 'PENDING'}>
            <summary>{locked ? 'Round configuration locked' : 'Edit round configuration'}</summary>
            <form className="round-config-form" onSubmit={(event) => void updateRound(event)}>
              <label><span>Duration (minutes)</span><input type="number" min="1" max="360" value={roundDuration} onChange={(event) => setRoundDuration(event.target.value)} disabled={locked} required /></label>
              {selectedRound.roundType === 'CODE_IN_DARK' && <label><span>Reading period (seconds)</span><input type="number" min="30" max="600" value={readingPeriodSeconds} onChange={(event) => setReadingPeriodSeconds(event.target.value)} disabled={locked} required /></label>}
              <label className="admin-checkbox"><input type="checkbox" checked={autoSubmitOnEnd} onChange={(event) => setAutoSubmitOnEnd(event.target.checked)} disabled={locked} /><span>Auto-submit when the round ends</span></label>
              <button className="gold-button" type="submit" disabled={locked}><Save size={14} /> Save configuration</button>
            </form>
          </details>
          <div className="round-danger-actions">
            {(selectedRound.status === 'ENDED' || selectedRound.status === 'PAUSED') && <button className="mini-button" type="button" onClick={() => void resetRound(selectedRound)}><Gavel size={14} /> Reset round</button>}
            <button className="mini-button danger" type="button" onClick={() => void deleteRound(selectedRound)}><Trash2 size={14} /> Delete round</button>
            {locked && <p><Lock size={14} /> Problem configuration is locked while this round is {selectedRound.status.toLowerCase()}.</p>}
          </div>
        </section>}
      </section>
    </> : <>
      <details className="admin-section bulk-import-section">
        <summary><span><Upload size={16} /> Bulk import coding problems</span><small>JSON</small></summary>
        <div className="bulk-import-body"><p>Each problem must target a pending round and include examples plus at least one hidden judge test case.</p>
          <textarea aria-label="Coding problem JSON" placeholder="Paste a JSON array of coding problems" value={importText} onChange={(event) => { setImportText(event.target.value); setImportPreview(null); setImportError('') }} />
          <div className="bulk-import-actions"><button className="mini-button" type="button" onClick={validateImport} disabled={!importText.trim()}>Validate and preview</button><button className="gold-button" type="button" onClick={() => void importProblems()} disabled={!importPreview}><Upload size={14} /> Confirm import</button></div>
          {importError && <p className="admin-message error" role="alert">{importError}</p>}
          {importPreview && <div className="import-preview"><strong>Preview · {importPreview.length} problem(s)</strong>{importPreview.map((problem, index) => <div key={`${problem.roundId}-${problem.title}-${index}`}><b>{problem.title}</b><span>{rounds.find((round) => round.id === problem.roundId)?.name} · {problem.examples.length} examples · {problem.testCases.length} judge tests · {problem.points} pts</span></div>)}</div>}
        </div>
      </details>

      <section className="problem-editor-shell">
        <div className="problem-editor-column">
          <section className="admin-section problem-form-section">
            <div className="workflow-section-heading"><div><div className="form-kicker">CODING PROBLEM</div><h3>{roundProblem ? 'Edit problem' : 'Create problem'}</h3></div><Database size={20} /></div>
            <label><span>Round</span><select value={selectedRoundId} onChange={(event) => selectRound(event.target.value)}><option value="">Select a round</option>{rounds.map((round) => <option value={round.id} key={round.id}>{round.name} · {round.status} · {problems.filter((problem) => problem.roundId === round.id).length} problem(s)</option>)}</select></label>
            {selectedRound && <div className="round-problem-manager"><header><div><span>PROBLEMS IN THIS ROUND</span><strong>{roundProblems.length}</strong></div><button className="mini-button" type="button" onClick={startNewProblem} disabled={locked}><Plus size={14} /> Add coding problem</button></header>{roundProblems.length ? <ol>{roundProblems.map((problem, index) => <li className={problem.id === selectedProblemId ? 'selected' : ''} key={problem.id}><button className="problem-nav-select" type="button" onClick={() => selectProblem(problem.id)}><b>{index + 1}</b><span><strong>{problem.title}</strong><small>{problem.points} pts · {problem.exampleCount ?? 0} examples · {problem.testCaseCount ?? 0} tests</small></span>{selectedRound.problems?.find((roundProblem) => roundProblem.id === problem.id)?.ready && <Check size={15} />}</button><div className="row-actions"><button className="mini-button" type="button" aria-label={`Move ${problem.title} up`} title="Move up" disabled={locked || index === 0} onClick={() => void moveProblem(index, -1)}><ArrowUp size={13} /></button><button className="mini-button" type="button" aria-label={`Move ${problem.title} down`} title="Move down" disabled={locked || index === roundProblems.length - 1} onClick={() => void moveProblem(index, 1)}><ArrowDown size={13} /></button></div></li>)}</ol> : <p>No coding problems configured for this round.</p>}</div>}
            {selectedRound && <div className={locked ? 'problem-lock-notice locked' : 'problem-lock-notice'}>{locked ? <><Lock size={15} /> Problem configuration locked · Round is {selectedRound.status}</> : roundProblem ? <><Check size={15} /> Editing {roundProblem.title}</> : 'Create a coding problem for this round.'}</div>}
            {selectedRound && <form className="problem-edit-form" onSubmit={(event) => void saveProblem(event)}>
              <div className="problem-core-fields"><label><span>Title</span><input value={problemDraft.title} onChange={(event) => setProblemDraft({ ...problemDraft, title: event.target.value })} disabled={locked} required /></label><label><span>Difficulty</span><select value={problemDraft.difficulty} onChange={(event) => setProblemDraft({ ...problemDraft, difficulty: event.target.value as ProblemDraft['difficulty'] })} disabled={locked}><option value="EASY">Easy</option><option value="MEDIUM">Medium</option><option value="HARD">Hard</option></select></label><label><span>Points</span><input type="number" min="1" max="10000" value={problemDraft.points} onChange={(event) => setProblemDraft({ ...problemDraft, points: event.target.value })} disabled={locked} required /></label></div>
              <label><span>Problem statement</span><textarea className="problem-statement-input" value={problemDraft.description} onChange={(event) => setProblemDraft({ ...problemDraft, description: event.target.value })} disabled={locked} required /></label>
              <div className="problem-formats-grid"><label><span>Input format</span><textarea value={problemDraft.inputFormat} onChange={(event) => setProblemDraft({ ...problemDraft, inputFormat: event.target.value })} disabled={locked} required /></label><label><span>Output format</span><textarea value={problemDraft.outputFormat} onChange={(event) => setProblemDraft({ ...problemDraft, outputFormat: event.target.value })} disabled={locked} required /></label></div>
              <label><span>Constraints</span><textarea value={problemDraft.constraints} onChange={(event) => setProblemDraft({ ...problemDraft, constraints: event.target.value })} disabled={locked} required /></label>
              <div className="problem-core-fields limits-fields"><label><span>Time limit (ms)</span><input type="number" min="1" max="60000" value={problemDraft.timeLimit} onChange={(event) => setProblemDraft({ ...problemDraft, timeLimit: event.target.value })} disabled={locked} required /></label><label><span>Memory limit (MB)</span><input type="number" min="1" max="4096" value={problemDraft.memoryLimit} onChange={(event) => setProblemDraft({ ...problemDraft, memoryLimit: event.target.value })} disabled={locked} required /></label></div>
              <button className="gold-button" type="submit" disabled={locked}><Save size={14} /> {roundProblem ? 'Save problem' : 'Create problem'}</button>
            </form>}
          </section>

          {roundProblem && <>
            <AdminSection title="Public examples" icon={<ClipboardList size={16} />}>
              <form className="problem-data-form" onSubmit={(event) => void saveExample(event)}><label><span>Input</span><textarea value={exampleDraft.input} onChange={(event) => setExampleDraft({ ...exampleDraft, input: event.target.value })} disabled={locked} required /></label><label><span>Output</span><textarea value={exampleDraft.output} onChange={(event) => setExampleDraft({ ...exampleDraft, output: event.target.value })} disabled={locked} required /></label><label><span>Explanation (optional)</span><textarea value={exampleDraft.explanation} onChange={(event) => setExampleDraft({ ...exampleDraft, explanation: event.target.value })} disabled={locked} /></label><div className="problem-data-actions"><button className="gold-button" type="submit" disabled={locked}>{editingExampleId ? 'Save example' : 'Add example'}</button>{editingExampleId && <button className="mini-button" type="button" onClick={() => { setEditingExampleId(''); setExampleDraft({ input: '', output: '', explanation: '' }) }}>Cancel edit</button>}</div></form>
              <div className="problem-data-list">{problemDetails?.examples.map((example, index) => <article className="data-item" key={example.id}><header><strong>Example {index + 1}</strong><span>PUBLIC</span><div className="row-actions"><button className="mini-button" type="button" title="Move up" aria-label="Move example up" disabled={locked || index === 0} onClick={() => void moveExample(index, -1)}><ArrowUp size={14} /></button><button className="mini-button" type="button" title="Move down" aria-label="Move example down" disabled={locked || index === (problemDetails.examples.length - 1)} onClick={() => void moveExample(index, 1)}><ArrowDown size={14} /></button><button className="mini-button" type="button" disabled={locked} onClick={() => { setEditingExampleId(example.id); setExampleDraft({ input: example.input, output: example.output, explanation: example.explanation ?? '' }) }}>Edit</button><button className="mini-button danger" type="button" disabled={locked} onClick={() => void deleteExample(example)}><Trash2 size={13} /></button></div></header><span>INPUT</span><pre>{example.input}</pre><span>OUTPUT</span><pre>{example.output}</pre>{example.explanation && <p>{example.explanation}</p>}</article>)}</div>
            </AdminSection>

            <AdminSection title="Judge test cases" icon={<Gavel size={16} />}>
              <form className="problem-data-form" onSubmit={(event) => void saveTestCase(event)}><label><span>Input</span><textarea value={testCaseDraft.input} onChange={(event) => setTestCaseDraft({ ...testCaseDraft, input: event.target.value })} disabled={locked} required /></label><label><span>Expected output</span><textarea value={testCaseDraft.output} onChange={(event) => setTestCaseDraft({ ...testCaseDraft, output: event.target.value })} disabled={locked} required /></label><label className="admin-checkbox"><input type="checkbox" checked={!testCaseDraft.isHidden} onChange={(event) => setTestCaseDraft({ ...testCaseDraft, isHidden: !event.target.checked })} disabled={locked} /><span>Public test case (hidden by default)</span></label><div className="problem-data-actions"><button className="gold-button" type="submit" disabled={locked}>{editingTestCaseId ? 'Save test case' : 'Add test case'}</button>{editingTestCaseId && <button className="mini-button" type="button" onClick={() => { setEditingTestCaseId(''); setTestCaseDraft({ input: '', output: '', isHidden: true }) }}>Cancel edit</button>}</div></form>
              <div className="problem-data-list">{problemDetails?.testCases.map((testCase, index) => <article className="test-case-row" key={testCase.id}><div><strong>#{index + 1}</strong><span className={testCase.isHidden ? 'visibility-pill hidden' : 'visibility-pill public'}>{testCase.isHidden ? 'HIDDEN' : 'PUBLIC'}</span><span>{lineCount(testCase.input)} input line(s)</span></div><pre>{testCase.input}</pre><div className="row-actions"><button className="mini-button" type="button" disabled={locked} onClick={() => { setEditingTestCaseId(testCase.id); setTestCaseDraft({ input: testCase.input, output: testCase.output, isHidden: testCase.isHidden }) }}>Edit</button><button className="mini-button" type="button" disabled={locked} onClick={() => void toggleTestCase(testCase)}>{testCase.isHidden ? 'Make public' : 'Hide'}</button><button className="mini-button" type="button" disabled={locked} onClick={() => void duplicateTestCase(testCase)}><Copy size={13} /> Duplicate</button><button className="mini-button danger" type="button" disabled={locked} onClick={() => void deleteTestCase(testCase)}><Trash2 size={13} /> Delete</button></div></article>)}</div>
            </AdminSection>
            <AdminSection title="Problem lifecycle" icon={<Database size={16} />}>
              <div className="problem-lifecycle-actions"><label><span>Duplicate into pending round</span><select value={duplicateRoundId} onChange={(event) => setDuplicateRoundId(event.target.value)} disabled={locked}><option value="">Select pending round</option>{pendingRounds.map((round) => <option value={round.id} key={round.id}>{round.name}</option>)}</select></label><button className="mini-button" type="button" disabled={locked || !duplicateRoundId} onClick={() => void duplicateProblem()}><Copy size={14} /> Duplicate problem and data</button><button className="mini-button danger" type="button" disabled={locked} onClick={() => void deleteProblem()}><Trash2 size={14} /> Delete problem</button></div>
            </AdminSection>
          </>}
        </div>
        <aside className="admin-section participant-problem-preview"><div className="workflow-section-heading"><div><div className="form-kicker">PARTICIPANT VIEW</div><h3>Problem preview</h3></div><Check size={20} /></div><ProblemView problem={previewProblem} /></aside>
      </section>
    </>}
  </div>
}

function AdminSection({ title, icon, children }: { title: string; icon: ReactNode; children: ReactNode }) {
  return <section className="admin-section"><div className="section-heading">{icon}<div><div className="form-kicker">CODING PROBLEM DATA</div><h3>{title}</h3></div></div>{children}</section>
}