import type { AdminMetrics } from '../../lib/types'

const metricLabels: Array<[keyof AdminMetrics, string, string]> = [
  ['totalParticipants', 'TOTAL PARTICIPANTS', 'Registered contest participants'],
  ['active', 'ACTIVE PARTICIPANTS', 'Registered or checked-in'],
  ['acceptedSolutions', 'ACCEPTED SOLUTIONS', 'Accepted submissions in the live round'],
  ['disqualified', 'DISQUALIFIED', 'Participants removed from the contest']
]

export function Metrics({ metrics }: { metrics: AdminMetrics }) {
  return <div className="metric-grid admin-summary-grid">{metricLabels.map(([key, label, description]) => <div className="metric-card" key={key}><div className="card-kicker">{label}</div><strong>{metrics[key]}</strong><span>{description}</span></div>)}</div>
}
