'use client'

import { useEffect, useState } from 'react'
import { getAssignment } from '../lib/api'
import type { Assignment } from '../lib/types'

export function useAssignment(token: string) {
  const [assignment, setAssignment] = useState<Assignment | null>(null)
  useEffect(() => { getAssignment(token).then(setAssignment) }, [token])
  return assignment
}
