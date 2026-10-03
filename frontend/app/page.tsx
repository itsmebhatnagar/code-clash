'use client'

import { AuthShell } from '../components/auth/AuthShell'
import { LandingExperience } from '../components/auth/LandingExperience'
import { AdminPanel } from '../components/admin/AdminPanel'
import { ParticipantPanel } from '../components/participant/ParticipantPanel'
import { useAuth } from '../hooks/useAuth'
import { useState, useEffect } from 'react'

export default function Page() {
  const { user, token, loading, login, logout } = useAuth()
  const [showAuth, setShowAuth] = useState(false)

  useEffect(() => {
    if (window.location.hash === '#login') {
      setShowAuth(true)
    }
  }, [])

  useEffect(() => {
    if (showAuth) {
      window.history.replaceState(null, '', '#login')
    } else {
      window.history.replaceState(null, '', window.location.pathname)
    }
  }, [showAuth])

  if (loading) return null
  if (!user || !token) return showAuth
    ? <AuthShell onLogin={login} onBack={() => setShowAuth(false)} />
    : <LandingExperience onEnter={() => setShowAuth(true)} />
  
  if (user.role === 'ADMIN') return <AdminPanel user={user} token={token} onLogout={logout} />
  return <ParticipantPanel user={user} token={token} onLogout={logout} />
}
