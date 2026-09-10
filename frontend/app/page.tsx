'use client'

import { AuthShell } from '../components/auth/AuthShell'
import { AdminPanel } from '../components/admin/AdminPanel'
import { ParticipantPanel } from '../components/participant/ParticipantPanel'
import { useAuth } from '../hooks/useAuth'

export default function Page() {
  const { user, token, loading, login, logout } = useAuth()
  if (loading) return null
  if (!user || !token) return <AuthShell onLogin={login} />
  if (user.role === 'ADMIN') return <AdminPanel user={user} token={token} onLogout={logout} />
  return <ParticipantPanel user={user} token={token} onLogout={logout} />
}
