'use client'

import { useState } from 'react'
import { ArrowLeft } from 'lucide-react'
import { Register } from './Register'
import { SignIn } from './SignIn'
import type { User } from '../../lib/types'

export function AuthShell({ onLogin, onBack }: { onLogin: (token: string, user: User) => void; onBack?: () => void }) {
  const [mode, setMode] = useState<'sign-in' | 'register'>('sign-in')
  return <main className="auth-shell">
    <section className="auth-panel">
      <div className="auth-intro">
        <div className="auth-intro-header">
          <a className="auth-echona-wordmark" href="/"><strong>ECHONA 2026</strong><span>TREASURE VOYAGE</span></a>
          {onBack && <button className="auth-return" type="button" onClick={onBack}><ArrowLeft size={14} /> HOME</button>}
        </div>
        <div className="intro-kicker">ECHONA&nbsp; // &nbsp;TREASURE VOYAGE</div>
        <div className="intro-copy"><div className="section-label">THE VOYAGE AWAITS</div><h1>Find the way.<br />Claim the treasure.</h1><p>Sign in to continue your voyage.</p></div>
        <div className="intro-footer">ECHONA 2K26</div>
      </div>
      <div className="auth-form-side">{mode === 'sign-in' ? <SignIn onRegister={() => setMode('register')} onLogin={onLogin} /> : <Register onSignIn={() => setMode('sign-in')} />}</div>
    </section>
  </main>
}
