'use client'

import dynamic from 'next/dynamic'
import { useEffect, useRef } from 'react'
import type { SubmissionResult } from '../../lib/types'

const MonacoEditor = dynamic(() => import('@monaco-editor/react'), { ssr: false })

export function CodeEditor({ language, sourceCode, submissionId, message, result, isSubmitting, readOnly = false, blindCoding = false, onLanguageChange, onSourceChange, onSubmit }: { language: string; sourceCode: string; submissionId: string | null; message: string; result: SubmissionResult | null; isSubmitting: boolean; readOnly?: boolean; blindCoding?: boolean; onLanguageChange: (value: string) => void; onSourceChange: (value: string) => void; onSubmit: () => void }) {
  const editorRef = useRef<{ focus: () => void; addCommand: (keybinding: number, handler: () => void) => void } | null>(null)

  useEffect(() => {
    if (blindCoding) editorRef.current?.focus()
  }, [blindCoding])

  return <form className="editor-panel" onSubmit={(event) => { event.preventDefault(); onSubmit() }}><div className="editor-toolbar"><select aria-label="Programming language" value={language} onChange={(event) => onLanguageChange(event.target.value)} disabled={isSubmitting || readOnly || blindCoding}><option value="c">C</option><option value="cpp">C++</option><option value="java">Java</option><option value="python">Python</option></select><span>{submissionId ? `SUBMISSION ${submissionId.slice(0, 8)}` : blindCoding ? 'BLIND CODING' : 'READY'}</span></div><div className="monaco-editor-shell"><MonacoEditor language={language} theme="vs-dark" value={sourceCode} onMount={(editor, monaco) => { editorRef.current = editor; editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter, onSubmit); if (blindCoding) editor.focus() }} onChange={(value) => onSourceChange(value ?? '')} loading="Charting the course..." options={{ automaticLayout: true, minimap: { enabled: false }, fontSize: 13, lineNumbers: 'on', tabSize: 2, wordWrap: 'on', scrollBeyondLastLine: false, padding: { top: 12, bottom: 12 }, readOnly: isSubmitting || readOnly }} /></div>{!blindCoding && <button className="gold-button" type="submit" disabled={isSubmitting || readOnly}>{isSubmitting ? 'JUDGING...' : readOnly ? 'READING PERIOD' : 'SUBMIT CODE'}</button>}{!blindCoding && message && <p className="form-message">{message}</p>}{!blindCoding && result && <div className={`judge-result ${result.status.toLowerCase()}`}><strong>{result.status.replaceAll('_', ' ')}</strong><span>{result.passedCases}/{result.totalCases} test cases · Compile {result.compilationTime == null ? 'N/A' : `${result.compilationTime} ms`} · Run {result.executionTime ?? 0} ms{result.maxTestCaseExecutionTime == null ? '' : ` (max ${result.maxTestCaseExecutionTime} ms)`} <span title="Times include sandbox/container initialization overhead. Not an exact benchmark of raw algorithm speed." style={{ cursor: 'help', borderBottom: '1px dotted currentColor', marginLeft: '6px', fontSize: '0.9em', opacity: 0.8 }}>ⓘ</span></span>{result.error && <small>{result.error}</small>}</div>}{blindCoding && <span className="blind-submit-hint" aria-hidden="true">SUBMIT: CTRL + ENTER</span>}</form>
}
