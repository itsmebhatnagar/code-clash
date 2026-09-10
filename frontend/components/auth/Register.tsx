'use client'

import { useEffect, useState } from 'react'
import { ArrowLeft, ArrowRight } from 'lucide-react'
import { registerParticipant } from '../../lib/api'

const fields = [['name', 'Name', 'Harshil Bhatnagar'], ['collegeId', 'College ID', '25CS019'], ['branch', 'Branch', 'Computer Science'], ['year', 'Year', '2nd year'], ['email', 'Email address', 'harshilbhatnagar@gmail.com'], ['password', 'Access code', 'Create an access code']] as const

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

  return <div className="register-wrap"><div className="form-kicker">PARTICIPANT REGISTRATION</div><h2>Join the crew.</h2><p className="form-subtitle">Create your station credentials to enter the contest.</p><form className="register-grid" onSubmit={handleSubmit} autoComplete="off">{fields.map(([key, label, placeholder]) => <label key={key}><span>{label}</span><input type={key === 'email' ? 'email' : key === 'password' ? 'password' : 'text'} autoComplete={key === 'password' ? 'new-password' : 'off'} placeholder={placeholder} required={key === 'name' || key === 'email' || key === 'password'} value={formData[key]} onChange={(event) => setFormData({ ...formData, [key]: event.target.value })} /></label>)}<div className="register-actions"><button className="gold-button" type="submit">CREATE ACCOUNT <ArrowRight size={15} /></button><button className="back-button" type="button" onClick={onSignIn}><ArrowLeft size={14} /> Back to sign in</button></div></form>{message && <p className="form-message">{message}</p>}</div>
}
