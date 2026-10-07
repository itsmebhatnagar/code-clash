'use client'

import { useEffect, useState } from 'react'
import { ArrowLeft, ArrowRight, User as UserIcon, IdCard, GraduationCap, Calendar, Mail, Key } from 'lucide-react'
import { registerParticipant } from '../../lib/api'

const fields = [
  ['name', 'Name', 'Harshil Bhatnagar', UserIcon],
  ['collegeId', 'College ID', '25CS019', IdCard],
  ['branch', 'Branch', 'Computer Science', GraduationCap],
  ['year', 'Year', '2nd year', Calendar],
  ['email', 'Email address', 'harshilbhatnagar@gmail.com', Mail],
  ['password', 'Password', 'Create a password', Key]
] as const

type FormData = Record<(typeof fields)[number][0], string>

export function Register({ onSignIn }: { onSignIn: () => void }) {
  const [formData, setFormData] = useState<FormData>({ name: '', collegeId: '', branch: '', year: '', email: '', password: '' })
  const [message, setMessage] = useState('')
  const [registered, setRegistered] = useState(false)

  useEffect(() => { if (!registered) return; const timer = setTimeout(onSignIn, 1600); return () => clearTimeout(timer) }, [onSignIn, registered])

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setMessage('Registering...')
    try {
      const { response, data } = await registerParticipant(formData)
      if (!response.ok) return setMessage(data.error || 'Registration failed')
      setMessage('Registration successful. Please sign in.'); setRegistered(true)
    } catch { setMessage('Network error.') }
  }

  return (
    <div className="premium-card-wrapper">
      <img src="/woodenscrool.png" alt="" className="scroll-image" draggable="false" />
      <div className="scroll-safe-area">
        <div className="register-wrap">
          <div className="form-kicker">PARTICIPANT REGISTRATION</div>
          <h2>Join the crew.</h2>
          <p className="form-subtitle">Create your station credentials to enter the contest.</p>
          
          <form className="register-grid" onSubmit={handleSubmit} autoComplete="off">
            {fields.map(([key, label, placeholder, Icon]) => (
              <label key={key} className="input-group">
                <span>{label}</span>
                <div className="input-wrapper">
                  <Icon size={16} className="input-icon" />
                  <input 
                    type={key === 'email' ? 'email' : key === 'password' ? 'password' : 'text'} 
                    autoComplete={key === 'password' ? 'new-password' : 'off'} 
                    placeholder={placeholder} 
                    required={key === 'name' || key === 'email' || key === 'password'} 
                    value={formData[key]} 
                    onChange={(event) => setFormData({ ...formData, [key]: event.target.value })} 
                  />
                </div>
              </label>
            ))}
            
            <div style={{ display: 'flex', gap: '8px', gridColumn: '1 / -1', marginTop: '6px' }}>
              <button className="gold-button glow-effect" type="submit" style={{ flex: 1, margin: 0, padding: '0 8px', fontSize: '12px', minHeight: '40px' }}>
                CREATE ACCOUNT
              </button>
              <button className="back-button" type="button" onClick={onSignIn} style={{ flex: 1, margin: 0, padding: '0 8px', fontSize: '12px', minHeight: '40px' }}>
                BACK TO SIGN IN
              </button>
            </div>
          </form>
          
          {message && <p className="form-message" role="status" style={{ background: 'rgba(255,255,255,0.5)', color: 'var(--mahogany-dark)', fontWeight: 700, padding: '8px', borderRadius: '4px', textAlign: 'center', border: '1px solid rgba(139, 94, 52, 0.3)', marginTop: '12px' }}>{message}</p>}
        </div>
      </div>
    </div>
  )
}
