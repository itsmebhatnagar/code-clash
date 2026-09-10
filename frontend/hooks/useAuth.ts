'use client'

import { useEffect, useState } from 'react'
import { getCurrentUser } from '../lib/api'
import type { User } from '../lib/types'

export function useAuth() {
  const [user, setUser] = useState<User | null>(null)
  const [token, setToken] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const savedToken = localStorage.getItem('cc_token')
    if (!savedToken) { setLoading(false); return }
    getCurrentUser(savedToken)
      .then((currentUser) => currentUser ? (setToken(savedToken), setUser(currentUser)) : localStorage.removeItem('cc_token'))
      .catch(() => localStorage.removeItem('cc_token'))
      .finally(() => setLoading(false))
  }, [])

  function login(newToken: string, nextUser: User) {
    localStorage.setItem('cc_token', newToken)
    setToken(newToken)
    setUser(nextUser)
  }

  function logout() {
    localStorage.removeItem('cc_token')
    setToken(null)
    setUser(null)
  }

  return { user, token, loading, login, logout }
}
