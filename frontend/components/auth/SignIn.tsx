'use client'

import { useState } from 'react'
import { ArrowRight } from 'lucide-react'
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

  return <div className="form-wrap"><div className="form-kicker">SECURE ACCESS</div><h2>Board the ship.</h2><form onSubmit={handleSubmit} autoComplete="off"><label><span>Email address</span><input type="email" autoComplete="off" placeholder="captain@college.edu" value={email} onChange={(event) => setEmail(event.target.value)} required /></label><label><span>Password</span><input type="password" autoComplete="new-password" placeholder="Enter password" value={password} onChange={(event) => setPassword(event.target.value)} required /></label><button className="gold-button" type="submit">BOARD THE SHIP <ArrowRight size={15} /></button></form>{message && <p className="form-message" role="status">{message}</p>}<p className="switch-copy">New participant? <button onClick={onRegister}>Create account</button></p></div>
}
