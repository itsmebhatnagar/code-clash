export const BACKEND_ORIGIN = process.env.NEXT_PUBLIC_BACKEND_URL?.replace(/\/$/, '')
  || (typeof window === 'undefined'
    ? 'http://localhost:5000'
    : `${window.location.protocol}//${window.location.hostname}:5000`)