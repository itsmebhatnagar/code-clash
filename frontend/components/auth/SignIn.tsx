'use client'

import { useState } from 'react'
import { ArrowRight, Mail, Key } from 'lucide-react'
import { login } from '../../lib/api'
import type { User } from '../../lib/types'

export function SignIn({ onRegister, onLogin }: { onRegister: () => void; onLogin: (token: string, user: User) => void }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [message, setMessage] = useState('')

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setMessage('Authenticating...')
    try {
      const { response, data } = await login(email, password)
      if (!response.ok || !data.token || !data.user) return setMessage(data.error || 'Login failed')
      onLogin(data.token, data.user)
    } catch { setMessage('Network error. Is the backend running?') }
  }

  return (
    <div className="premium-card-wrapper">
      <img src="/woodenscrool.png" alt="" className="scroll-image" draggable="false" />
      <div className="scroll-safe-area">
        <div className="form-wrap">
          <div className="form-kicker">SECURE ACCESS</div>
          <h2>Board the ship.</h2>
          <p className="form-subtitle">Enter your credentials to continue the voyage.</p>
          
          <form onSubmit={handleSubmit} autoComplete="off" className="auth-form">
            <label className="input-group">
              <span>Email address</span>
              <div className="input-wrapper">
                <Mail size={16} className="input-icon" />
                <input type="email" autoComplete="off" placeholder="captain@college.edu" value={email} onChange={(event) => setEmail(event.target.value)} required />
              </div>
            </label>
            
            <label className="input-group">
              <span>Password</span>
              <div className="input-wrapper">
                <Key size={16} className="input-icon" />
                <input type="password" autoComplete="new-password" placeholder="Enter password" value={password} onChange={(event) => setPassword(event.target.value)} required />
              </div>
            </label>
            
            <div style={{ display: 'flex', gap: '8px', marginTop: '12px' }}>
              <button className="gold-button glow-effect" type="submit" style={{ flex: 1, margin: 0, padding: '0 8px', fontSize: '12px', minHeight: '40px' }}>
                BOARD THE SHIP
              </button>
              <button type="button" onClick={onRegister} className="back-button" style={{ flex: 1, margin: 0, padding: '0 8px', fontSize: '12px', minHeight: '40px' }}>
                CREATE ACCOUNT
              </button>
            </div>
          </form>
          
          {message && <p className="form-message" role="status" style={{ background: 'rgba(255,255,255,0.5)', color: 'var(--mahogany-dark)', fontWeight: 700, padding: '6px', borderRadius: '4px', textAlign: 'center', border: '1px solid rgba(139, 94, 52, 0.3)', marginTop: '8px' }}>{message}</p>}
        </div>
      </div>
    </div>
  )
}
