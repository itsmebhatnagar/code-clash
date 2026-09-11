import type { AdminMetrics, Assignment, Participant, ParticipantDashboard, SubmissionResult, User } from './types'

export const API_URL = 'http://localhost:5000/api'

export function getToken() {
  return typeof window === 'undefined' ? null : localStorage.getItem('cc_token')
}

function authHeaders(token: string) {
  return { Authorization: `Bearer ${token}` }
}

export async function getCurrentUser(token: string) {
  const response = await fetch(`${API_URL}/auth/me`, { headers: authHeaders(token) })
  if (!response.ok) return null
  const data = await response.json() as { user?: User }
  return data.user ?? null
}

export async function login(email: string, password: string) {
  const response = await fetch(`${API_URL}/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password }) })
  const data = await response.json()
  return { response, data: data as { token?: string; user?: User; error?: string } }
}

export async function registerParticipant(formData: Record<string, string>) {
  const response = await fetch(`${API_URL}/auth/register`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...formData, college: formData.branch }) })
  return { response, data: await response.json() as { error?: string } }
}

export async function getParticipants(token: string) {
  const response = await fetch(`${API_URL}/admin/participants`, { headers: authHeaders(token) })
  return response.ok ? await response.json() as Participant[] : []
}

export async function getAdminMetrics(token: string) {
  const response = await fetch(`${API_URL}/admin/metrics`, { headers: authHeaders(token) })
  return response.ok ? await response.json() as AdminMetrics : { totalParticipants: 0, registered: 0, checkedIn: 0, active: 0, completed: 0, disqualified: 0, connected: 0, inContest: 0, submitted: 0, acceptedSolutions: 0, disconnected: 0, currentRound: null, currentRoundId: null, liveContestStatus: 'UNKNOWN', countdownSeconds: 0 }
}

export async function adminFetch<T>(token: string, path: string) {
  const response = await fetch(`${API_URL}/admin${path}`, { headers: authHeaders(token) })
  const data = response.status === 204 ? null : await response.json()
  return { response, data: data as T }
}

export async function adminMutate<T>(token: string, path: string, method: 'POST' | 'PUT' | 'DELETE', body?: unknown) {
  const response = await fetch(`${API_URL}/admin${path}`, {
    method,
    headers: { ...authHeaders(token), 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  const data = response.status === 204 ? null : await response.json()
  return { response, data: data as T }
}

export async function getAssignment(token: string) {
  const response = await fetch(`${API_URL}/contest/assignment`, { headers: authHeaders(token) })
  return response.ok ? await response.json() as Assignment : null
}

export async function getParticipantDashboard(token: string) {
  const response = await fetch(`${API_URL}/contest/dashboard`, { headers: authHeaders(token) })
  return response.ok ? await response.json() as ParticipantDashboard : { round: null }
}

export async function submitCode(token: string, payload: { problemId: string; roundId: string; language: string; sourceCode: string }) {
  const response = await fetch(`${API_URL}/contest/submit`, { method: 'POST', headers: { ...authHeaders(token), 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
  return { response, data: await response.json() as { id?: string; error?: string; status?: string } }
}

export type { SubmissionResult }
