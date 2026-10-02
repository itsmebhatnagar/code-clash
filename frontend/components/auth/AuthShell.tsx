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
      {onBack && <button className="auth-return" type="button" onClick={onBack}><ArrowLeft size={17} /> HOME</button>}
      <div className="auth-form-side">{mode === 'sign-in' ? <SignIn onRegister={() => setMode('register')} onLogin={onLogin} /> : <Register onSignIn={() => setMode('sign-in')} />}</div>
    </section>
  </main>
}
