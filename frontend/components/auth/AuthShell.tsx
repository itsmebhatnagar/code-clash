'use client'

import { useState } from 'react'
import { Register } from './Register'
import { SignIn } from './SignIn'
import type { User } from '../../lib/types'

export function AuthShell({ onLogin }: { onLogin: (token: string, user: User) => void }) {
  const [mode, setMode] = useState<'sign-in' | 'register'>('sign-in')
  return <main className="auth-shell">
    <section className="auth-panel">
      <div className="auth-intro">
        <div className="brand-lockup"><span className="brand-mark">◈</span><strong>CODE CLASH</strong></div>
        <div className="intro-kicker">CODE CLASH&nbsp; // &nbsp;COMMAND DECK</div>
        <div className="intro-copy"><div className="section-label">ENTER THE ARENA</div><h1>Outcode. Outlast.<br />Claim the Treasure.</h1><p>Secure access to the live coding voyage. Your station, round data, and leaderboard await.</p></div>
        <div className="intro-footer">AUTHENTICATED STATIONS ONLY&nbsp; / &nbsp;V1.0</div>
      </div>
      <div className="auth-form-side">{mode === 'sign-in' ? <SignIn onRegister={() => setMode('register')} onLogin={onLogin} /> : <Register onSignIn={() => setMode('sign-in')} />}</div>
    </section>
  </main>
}
