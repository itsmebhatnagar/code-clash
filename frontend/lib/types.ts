export type UserRole = 'ADMIN' | 'PARTICIPANT' | 'JUDGE'

export type User = {
  id?: string
  name: string
  email: string
  role: UserRole
  status?: string
  college?: string
  collegeId?: string
}

export type Participant = {
  id: string
  name: string
  email: string
  college?: string | null
  collegeId?: string | null
  status: string
}

export type AdminRound = {
  id: string
  name: string
  duration: number
  status: string
  lateEntryCutoffMinutes: number
  autoSubmitOnEnd: boolean
  startTime?: string | null
  endTime?: string | null
  problems?: Array<{ id: string; title: string }>
}

export type AdminProblem = Problem & {
  roundId: string
  difficulty: string
  round?: AdminRound
  examples?: Array<{ id: string; input: string; output: string; explanation?: string | null }>
  testCases?: Array<{ id: string; input: string; output: string; isHidden: boolean }>
}

export type AdminWorkstation = {
  id: string
  pcNumber: string
  participantId?: string | null
  participant?: { name: string; email: string } | null
}

export type AdminSubmission = {
  id: string
  status: string
  language: string
  sourceCode: string
  passedCases: number
  totalCases: number
  createdAt: string
  participant: { name: string; email: string }
  problem: { title: string; round?: { name: string } }
}

export type AdminEvaluation = {
  id: string
  participantId: string
  round1Score: number
  round2Score: number
  manualAdjustments: number
  finalScore: number
  codeQuality: number
  logicClarity: number
  judgeComments?: string | null
  lockedAt?: string | null
  participant: { name: string; email: string }
}

export type AdminAuditLog = { id: string; actionType: string; description: string; timestamp: string }
export type AdminSetting = { key: string; value: string; updatedBy: string; updatedAt: string }
export type SuddenDeathRound = { id: string; name: string; duration: number; status: string; participantIds: string; bonusPoints: number; problemId?: string | null; startTime?: string | null; endTime?: string | null }

export type AdminMetrics = {
  totalParticipants: number
  registered: number
  checkedIn: number
  active: number
  completed: number
  disqualified: number
  connected: number
  inContest: number
  submitted: number
  acceptedSolutions: number
  disconnected: number
  currentRound: string | null
  currentRoundId: string | null
  liveContestStatus: string
  countdownSeconds: number
}

export type Problem = {
  id: string
  title: string
  description: string
  inputFormat: string
  outputFormat: string
  constraints?: string
  timeLimit: number
  memoryLimit: number
}

export type Assignment = { id: string; problems: Problem[] }
export type ParticipantDashboard = {
  round: (Assignment & { name: string; duration: number; startTime?: string | null }) | null
  stats?: { solved: number; attempted: number; totalProblems: number; score: number; rank: number | null }
}

export type SubmissionResult = {
  status: string
  passedCases: number
  totalCases: number
  executionTime?: number
  error?: string
}
