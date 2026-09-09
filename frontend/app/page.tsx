'use client'

import { useState, useEffect } from 'react'
import { ArrowLeft, ArrowRight, ClipboardList, Clock3, Code2, Download, LogOut, Play, ShieldCheck, Users, XCircle } from 'lucide-react'
import { io, Socket } from 'socket.io-client'

const API_URL = 'http://localhost:5000/api'
const SOCKET_URL = 'http://localhost:5000'

type Panel = 'auth' | 'admin' | 'participant'

export default function Page() {
  const [mode, setMode] = useState<'sign-in' | 'register'>('sign-in')
  const [panel, setPanel] = useState<Panel>('auth')
  const [token, setToken] = useState<string | null>(null)

  useEffect(() => {
    const savedToken = localStorage.getItem('cc_token')
    if (savedToken) {
      setToken(savedToken)
      fetch(`${API_URL}/auth/me`, { headers: { Authorization: `Bearer ${savedToken}` } })
        .then(res => res.json())
        .then(data => {
          if (data.user) {
            setPanel(data.user.role === 'ADMIN' ? 'admin' : 'participant')
          } else {
            localStorage.removeItem('cc_token')
          }
        })
        .catch(() => localStorage.removeItem('cc_token'))
    }
  }, [])

  const handleLogin = (newToken: string, role: string) => {
    localStorage.setItem('cc_token', newToken)
    setToken(newToken)
    setPanel(role === 'ADMIN' ? 'admin' : 'participant')
  }

  const handleLogout = () => {
    localStorage.removeItem('cc_token')
    setToken(null)
    setPanel('auth')
  }

  if (panel === 'admin' && token) return <AdminPanel token={token} onLogout={handleLogout} />
  if (panel === 'participant' && token) return <ParticipantPanel token={token} onLogout={handleLogout} />

  return (
    <main className="auth-shell">
      <section className="auth-panel">
        <div className="auth-intro">
          <div className="intro-kicker">CODE·CLASH / CONTEST OS</div>
          <div className="intro-copy">
            <h1>A serious platform<br />for serious contests.</h1>
            <p>Judge-authoritative timing. Sandboxed execution. Two rounds, one leaderboard. Built for the room, not the browser.</p>
            <div className="intro-stats"><span><strong>30:00</strong><small>ROUND 1</small></span><span><strong>20:00</strong><small>ROUND 2</small></span><span><strong>04</strong><small>LANGUAGES</small></span></div>
          </div>
          <div className="intro-footer">© CODE·CLASH · v1.0</div>
        </div>
        <div className="auth-form-side">
          {mode === 'sign-in' ? <SignIn onRegister={() => setMode('register')} onLogin={handleLogin} /> : <Register onSignIn={() => setMode('sign-in')} />}
        </div>
      </section>
    </main>
  )
}

function SignIn({ onRegister, onLogin }: { onRegister: () => void; onLogin: (token: string, role: string) => void }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [message, setMessage] = useState('')

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setMessage('Authenticating...')
    try {
      const res = await fetch(`${API_URL}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password })
      })
      const data = await res.json()
      if (res.ok) {
        onLogin(data.token, data.user.role)
      } else {
        setMessage(data.error || 'Login failed')
      }
    } catch (err) {
      setMessage('Network error. Is the backend running?')
    }
  }

  return <div className="form-wrap">
    <div className="form-kicker">SIGN IN</div><h2>Access the arena</h2><p className="form-subtitle">Use your credentials to enter the contest.</p>
    <form onSubmit={handleSubmit}>
      <label>Email<input type="email" placeholder="you@college.edu" value={email} onChange={(event) => setEmail(event.target.value)} required /></label>
      <label>Password<input type="password" value={password} onChange={(event) => setPassword(event.target.value)} required /></label>
      <button className="black-button" type="submit">Sign In <ArrowRight size={15} /></button>
    </form>
    {message && <p className="form-message" role="status">{message}</p>}
    <p className="switch-copy">New participant? <button onClick={onRegister}>Create account</button></p>
  </div>
}

function Register({ onSignIn }: { onSignIn: () => void }) {
  const [formData, setFormData] = useState({ name: '', college: '', email: '', phone: '', collegeId: '', password: '' })
  const [message, setMessage] = useState('')

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setMessage('Registering...')
    try {
      const res = await fetch(`${API_URL}/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData)
      })
      const data = await res.json()
      if (res.ok) {
        setMessage('Registration successful! Please sign in.')
        setTimeout(onSignIn, 2000)
      } else {
        setMessage(data.error || 'Registration failed')
      }
    } catch (err) {
      setMessage('Network error.')
    }
  }

  return <div className="register-wrap">
    <div className="form-kicker">PARTICIPANT REGISTRATION</div>
    <h2>Register for CODE·CLASH</h2>
    <p className="form-subtitle">You will receive a Participant ID after registration.</p>
    <form className="register-grid" onSubmit={handleSubmit}>
      <label>Full name<input required value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} /></label>
      <label>College<input value={formData.college} onChange={e => setFormData({...formData, college: e.target.value})} /></label>
      <label>Email<input type="email" required value={formData.email} onChange={e => setFormData({...formData, email: e.target.value})} /></label>
      <label>Phone<input value={formData.phone} onChange={e => setFormData({...formData, phone: e.target.value})} /></label>
      <label>College ID<input value={formData.collegeId} onChange={e => setFormData({...formData, collegeId: e.target.value})} /></label>
      <label>Password<input type="password" required value={formData.password} onChange={e => setFormData({...formData, password: e.target.value})} /></label>
      <div className="register-actions">
        <button className="black-button" type="submit">Create Account <ArrowRight size={15} /></button>
        <button className="back-button" type="button" onClick={onSignIn}><ArrowLeft size={14} /> Back to sign in</button>
      </div>
    </form>
    {message && <p style={{ gridColumn: '1 / -1', color: 'var(--accent)', marginTop: 10 }}>{message}</p>}
  </div>
}

function PanelHeader({ eyebrow, title, subtitle, onLogout }: { eyebrow: string; title: string; subtitle: string; onLogout: () => void }) {
  return <header className="panel-header"><div><div className="intro-kicker">{eyebrow}</div><h1>{title}</h1><p>{subtitle}</p></div><button className="logout-button" onClick={onLogout}><LogOut size={15} /> Sign out</button></header>
}

function AdminPanel({ token, onLogout }: { token: string; onLogout: () => void }) {
  const [participants, setParticipants] = useState<any[]>([])
  const [socket, setSocket] = useState<Socket | null>(null)
  const [roundState, setRoundState] = useState<any>(null)

  useEffect(() => {
    fetch(`${API_URL}/admin/participants`, { headers: { Authorization: `Bearer ${token}` } })
      .then(res => res.json())
      .then(data => setParticipants(data || []))

    const newSocket = io(SOCKET_URL, { auth: { token } })
    setSocket(newSocket)

    newSocket.on('ROUND_STATE_UPDATE', (data) => {
      setRoundState(data)
    })

    return () => { newSocket.disconnect() }
  }, [token])

  const startRound = () => socket?.emit('START_ROUND', { roundId: 'round-1' })
  const pauseRound = () => socket?.emit('PAUSE_ROUND', { roundId: roundState?.roundId })
  const endRound = () => socket?.emit('END_ROUND', { roundId: roundState?.roundId })

  return <main className="dashboard-shell">
    <PanelHeader eyebrow="CODE·CLASH / ADMIN CONTROL" title="Contest operations" subtitle="Live operational data from the contest database." onLogout={onLogout} />
    <div className="metric-grid">
      <Metric label="LIVE PARTICIPANTS" value={participants.length.toString()} detail="Active connections" icon={<Users size={18} />} />
      <Metric label="ACTIVE ROUND" value={roundState ? roundState.status : 'PENDING'} detail="Current State" icon={<Clock3 size={18} />} />
      <Metric label="PENDING REVIEWS" value="0" detail="Awaiting logic check" icon={<ClipboardList size={18} />} />
      <Metric label="SYSTEM STATUS" value="ONLINE" detail="All systems operational" icon={<ShieldCheck size={18} />} />
    </div>
    <div className="panel-grid">
      <section className="data-card wide-card">
        <div className="card-heading">
          <div><div className="card-kicker">PARTICIPANT ROSTER</div><h2>Live room activity</h2></div>
          <button className="outline-button"><Download size={14} /> Export</button>
        </div>
        {participants.length === 0 ? (
          <div className="empty-state">No participant records are available yet.</div>
        ) : (
          <table style={{width: '100%', textAlign: 'left', marginTop: 20}}>
            <thead><tr><th>Name</th><th>Email</th><th>College</th><th>Status</th></tr></thead>
            <tbody>
              {participants.map(p => <tr key={p.id}><td>{p.name}</td><td>{p.email}</td><td>{p.college || '-'}</td><td>{p.status}</td></tr>)}
            </tbody>
          </table>
        )}
      </section>
      <section className="data-card">
        <div className="card-kicker">ROUND CONTROL</div>
        <h2>Judge-authoritative clock</h2>
        <div className="big-clock">{roundState?.status === 'ACTIVE' ? 'LIVE' : '—:—'}</div>
        <div className="control-row">
          {roundState?.status !== 'ACTIVE' ? (
            <button className="black-button" onClick={startRound}><Play size={14} /> Start round</button>
          ) : (
            <button className="black-button" onClick={pauseRound}>Pause round</button>
          )}
          <button className="outline-button" onClick={endRound} disabled={!roundState || roundState.status === 'ENDED'}>End round</button>
        </div>
      </section>
    </div>
  </main>
}

function ParticipantPanel({ token, onLogout }: { token: string; onLogout: () => void }) {
  const [user, setUser] = useState<any>(null)
  const [socket, setSocket] = useState<Socket | null>(null)
  const [roundState, setRoundState] = useState<any>(null)
  const [assignment, setAssignment] = useState<any>(null)

  useEffect(() => {
    fetch(`${API_URL}/auth/me`, { headers: { Authorization: `Bearer ${token}` } })
      .then(res => res.json())
      .then(data => setUser(data.user))

    const newSocket = io(SOCKET_URL, { auth: { token } })
    setSocket(newSocket)

    newSocket.on('ROUND_STATE_UPDATE', (data) => {
      setRoundState(data)
      if (data.status === 'ACTIVE') {
        fetch(`${API_URL}/contest/assignment`, { headers: { Authorization: `Bearer ${token}` } })
          .then(res => res.json())
          .then(assignData => setAssignment(assignData))
      }
    })

    newSocket.on('FORCE_SUBMIT', () => {
      // Auto-submit code
    })

    return () => { newSocket.disconnect() }
  }, [token])

  if (!user) return <div style={{padding: 40, color: '#fff'}}>Loading profile...</div>

  return <main className="dashboard-shell participant-shell">
    <PanelHeader eyebrow="CODE·CLASH / PARTICIPANT" title="Your arena" subtitle={`Welcome, ${user.name}`} onLogout={onLogout} />
    <div className="participant-topline">
      <span className="status status-not-started">{user.status}</span>
      <span>ROUND {roundState?.status || 'PENDING'}</span>
      <span>WORKSTATION {user.collegeId || '—'}</span>
    </div>

    {roundState?.status === 'ACTIVE' && assignment ? (
      <section className="start-card" style={{ display: 'block' }}>
        <div className="card-kicker">PROBLEM STATEMENT</div>
        <h2>{assignment.problems?.[0]?.title || 'No active problem'}</h2>
        <p style={{ marginTop: 10 }}>{assignment.problems?.[0]?.description}</p>
        <textarea 
          placeholder="Write your code here..." 
          style={{ width: '100%', height: 300, marginTop: 20, padding: 15, background: '#111', color: '#fff', border: '1px solid #333' }}
        />
        <button className="black-button" style={{ marginTop: 20 }}>Submit Code</button>
      </section>
    ) : (
      <section className="start-card">
        <div className="start-mark"><Code2 size={28} /></div>
        <div>
          <div className="card-kicker">CONTEST ASSIGNMENT</div>
          <h2>Waiting for your assignment.</h2>
          <p>The test can start only after your verified participant profile, contest round, workstation, and problem assignment are loaded from the contest database.</p>
        </div>
        <button className="black-button start-button" disabled>Start test <ArrowRight size={15} /></button>
      </section>
    )}
  </main>
}

function Metric({ label, value, detail, icon }: { label: string; value: string; detail: string; icon: React.ReactNode }) { return <div className="metric-card"><div className="metric-icon">{icon}</div><div className="card-kicker">{label}</div><strong>{value}</strong><span>{detail}</span></div> }
