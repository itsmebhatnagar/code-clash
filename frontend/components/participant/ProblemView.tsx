import type { Problem } from '../../lib/types'

export function ProblemView({ problem }: { problem: Problem }) {
  return <div className="problem-panel"><div className="form-kicker">PROBLEM STATEMENT</div><h2>{problem.title}</h2><p>{problem.description}</p><div className="problem-limits">TIME {problem.timeLimit} MS <span /> MEMORY {problem.memoryLimit} MB</div><div className="format-block"><strong>INPUT</strong><p>{problem.inputFormat}</p><strong>OUTPUT</strong><p>{problem.outputFormat}</p></div></div>
}
