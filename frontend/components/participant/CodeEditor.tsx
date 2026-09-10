'use client'

import dynamic from 'next/dynamic'
import { ArrowRight } from 'lucide-react'
import type { SubmissionResult } from '../../lib/types'

const MonacoEditor = dynamic(() => import('@monaco-editor/react'), { ssr: false })

export function CodeEditor({ language, sourceCode, submissionId, message, result, isSubmitting, onLanguageChange, onSourceChange, onSubmit }: { language: string; sourceCode: string; submissionId: string | null; message: string; result: SubmissionResult | null; isSubmitting: boolean; onLanguageChange: (value: string) => void; onSourceChange: (value: string) => void; onSubmit: () => void }) {
  return <form className="editor-panel" onSubmit={(event) => { event.preventDefault(); onSubmit() }}><div className="editor-toolbar"><select value={language} onChange={(event) => onLanguageChange(event.target.value)} disabled={isSubmitting}><option value="javascript">JavaScript</option><option value="python">Python</option><option value="cpp">C++</option><option value="java">Java</option></select><span>{submissionId ? `SUBMISSION ${submissionId.slice(0, 8)}` : 'READY'}</span></div><div className="monaco-editor-shell"><MonacoEditor language={language} theme="vs-dark" value={sourceCode} onChange={(value) => onSourceChange(value ?? '')} loading="Loading editor..." options={{ automaticLayout: true, minimap: { enabled: false }, fontSize: 13, lineNumbers: 'on', tabSize: 2, wordWrap: 'on', scrollBeyondLastLine: false, padding: { top: 12, bottom: 12 }, readOnly: isSubmitting }} /></div><button className="gold-button" type="submit" disabled={isSubmitting}>{isSubmitting ? 'JUDGING...' : 'SUBMIT CODE'} {!isSubmitting && <ArrowRight size={15} />}</button>{message && <p className="form-message">{message}</p>}{result && <div className={`judge-result ${result.status.toLowerCase()}`}><strong>{result.status.replaceAll('_', ' ')}</strong><span>{result.passedCases}/{result.totalCases} test cases · {result.executionTime || 0} ms</span>{result.error && <small>{result.error}</small>}</div>}</form>
}
