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

export type AdminMetrics = {
  totalParticipants: number
  registered: number
  checkedIn: number
  active: number
  completed: number
  connected: number
  inContest: number
  submitted: number
  disconnected: number
  currentRound: string | null
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

export type SubmissionResult = {
  status: string
  passedCases: number
  totalCases: number
  executionTime?: number
  error?: string
}
