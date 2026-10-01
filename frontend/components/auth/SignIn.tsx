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
    <div className="form-wrap premium-card">
      <div className="form-kicker">SECURE ACCESS</div>
      <h2>Board the ship.</h2>
      <p className="form-subtitle">Enter your credentials to continue the voyage.</p>
      
      <form onSubmit={handleSubmit} autoComplete="off">
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
        
        <button className="gold-button glow-effect" type="submit">
          BOARD THE SHIP <ArrowRight size={15} />
        </button>
      </form>
      
      {message && <p className="form-message" role="status">{message}</p>}
      
      <div className="switch-copy-wrapper">
        <p className="switch-copy">New participant? <button onClick={onRegister}>Create account</button></p>
      </div>
    </div>
  )
}
