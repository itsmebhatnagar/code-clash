'use client'

import { AuthShell } from '../components/auth/AuthShell'
import { LandingExperience } from '../components/auth/LandingExperience'
import { AdminPanel } from '../components/admin/AdminPanel'
import { ParticipantPanel } from '../components/participant/ParticipantPanel'
import { useAuth } from '../hooks/useAuth'
import { useState, useEffect, useRef } from 'react'

export default function Page() {
  const { user, token, loading, login, logout } = useAuth()
  const [showAuth, setShowAuth] = useState(false)
  const [introState, setIntroState] = useState<'playing' | 'fading' | 'finished'>('playing')
  const fadingStartedRef = useRef(false)

  useEffect(() => {
    if (typeof window !== 'undefined' && sessionStorage.getItem('echonaIntroPlayed')) {
      setIntroState('finished')
    }
  }, [])

  const handleIntroEnd = () => {
    if (fadingStartedRef.current) return
    fadingStartedRef.current = true
    setIntroState('fading')
    if (typeof window !== 'undefined') sessionStorage.setItem('echonaIntroPlayed', 'true')
    setTimeout(() => {
      setIntroState('finished')
    }, 1200) // 1.2s smooth fade
  }

  const handleTimeUpdate = (e: React.SyntheticEvent<HTMLVideoElement>) => {
    const video = e.currentTarget
    if (video.duration > 0 && video.duration - video.currentTime <= 2.0) {
      handleIntroEnd()
    }
  }

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

  if (loading && introState === 'finished') {
    return <div style={{ minHeight: '100vh', background: '#050d1a' }} />
  }

  let mainContent = null
  if (!loading) {
    if (!user || !token) {
      mainContent = showAuth 
        ? <AuthShell onLogin={login} onBack={() => setShowAuth(false)} />
        : <LandingExperience onEnter={() => setShowAuth(true)} />
    } else if (user.role === 'ADMIN') {
      mainContent = <AdminPanel user={user} token={token} onLogout={logout} />
    } else {
      mainContent = <ParticipantPanel user={user} token={token} onLogout={logout} />
    }
  }

  return (
    <>
      {mainContent}
      {introState !== 'finished' && (
        <div style={{ 
          position: 'fixed', inset: 0, zIndex: 9999, background: '#050d1a',
          opacity: introState === 'fading' ? 0 : 1,
          transition: 'opacity 1.2s ease-in-out',
          pointerEvents: introState === 'fading' ? 'none' : 'auto',
          display: 'flex', alignItems: 'center', justifyContent: 'center'
        }}>
          <video 
            autoPlay 
            muted 
            playsInline 
            onTimeUpdate={handleTimeUpdate}
            onEnded={handleIntroEnd}
            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
          >
            <source src="/echona_ink_intro.mp4" type="video/mp4" />
          </video>
          <button 
            onClick={handleIntroEnd}
            style={{ position: 'absolute', bottom: '40px', right: '40px', background: 'transparent', color: '#d4af37', border: '1px solid #d4af37', padding: '8px 16px', borderRadius: '4px', font: '12px Courier New, monospace', cursor: 'pointer', opacity: 0.6 }}
          >
            SKIP
          </button>
        </div>
      )}
    </>
  )
}
