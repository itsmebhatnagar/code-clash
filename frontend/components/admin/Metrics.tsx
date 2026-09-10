import type { AdminMetrics } from '../../lib/types'

const metricLabels: Array<[keyof AdminMetrics, string]> = [
  ['totalParticipants', 'TOTAL PARTICIPANTS'],
  ['registered', 'REGISTERED'],
  ['checkedIn', 'CHECKED-IN'],
  ['active', 'ACTIVE'],
  ['completed', 'COMPLETED'],
  ['connected', 'CONNECTED NOW'],
  ['submitted', 'SUBMITTED'],
  ['disconnected', 'DISCONNECTED'],
  ['inContest', 'IN CONTEST']
]

export function Metrics({ metrics }: { metrics: AdminMetrics }) {
  return <div className="metric-grid">{metricLabels.map(([key, label]) => <div className="metric-card" key={key}><div className="card-kicker">{label}</div><strong>{metrics[key]}</strong><span>{key === 'connected' ? 'Unique connected participants' : key === 'submitted' ? 'Unique active-round submitters' : key === 'inContest' ? 'Connected while round is active' : key === 'disconnected' ? 'Registered but not connected' : key === 'active' ? 'Registered or checked-in' : 'Database participants'}</span></div>)}</div>
}
