export type AccountUser = {
  user_id: string
  full_name: string
  email: string
  email_verified: boolean
  theme: 'system' | 'light' | 'dark'
  monthly_email: boolean
  created_at: string
}

export type SignupResponse = {
  user: AccountUser
  verification_token: string
  message: string
}

export type SigninResponse = {
  session_token: string
  user: AccountUser
}

const apiBase = (import.meta.env.VITE_PROCESSING_API_URL || 'http://127.0.0.1:8000').replace(/\/$/, '')
const sessionKey = 'finsim-session-token'
const userKey = 'finsim-account-user'
const sessionEvent = 'finsim-session-updated'

export async function signup(fullName: string, email: string, password: string) {
  return request<SignupResponse>('/api/accounts/signup', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ full_name: fullName, email, password }),
  })
}

export async function verifyEmail(token: string) {
  return request<{ user: AccountUser }>('/api/accounts/verify-email', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token }),
  })
}

export async function updateAccountSettings(settings: {
  full_name?: string
  theme?: AccountUser['theme']
  monthly_email?: boolean
}) {
  const response = await request<{ user: AccountUser }>('/api/accounts/settings', {
    method: 'PATCH',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(settings),
  })
  localStorage.setItem(userKey, JSON.stringify(response.user))
  window.dispatchEvent(new Event(sessionEvent))
  return response
}

export async function signin(email: string, password: string) {
  const response = await request<SigninResponse>('/api/accounts/signin', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  })
  saveSession(response.session_token, response.user)
  return response
}

export function saveSession(token: string, user: AccountUser) {
  localStorage.setItem(sessionKey, token)
  localStorage.setItem(userKey, JSON.stringify(user))
  window.dispatchEvent(new Event(sessionEvent))
}

export async function signout() {
  const token = getSessionToken()
  try {
    if (token) {
      await request<void>('/api/accounts/signout', {
        method: 'POST',
        headers: authHeaders(),
      }, false)
    }
  } finally {
    clearSession()
  }
}

export function clearSession() {
  localStorage.removeItem(sessionKey)
  localStorage.removeItem(userKey)
  window.dispatchEvent(new Event(sessionEvent))
}

export function getSessionToken() {
  return localStorage.getItem(sessionKey)
}

export function authHeaders(headers: HeadersInit = {}) {
  const token = getSessionToken()
  return {
    ...headers,
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  }
}

export function getStoredUser() {
  const stored = localStorage.getItem(userKey)
  if (!stored) return null
  try {
    return JSON.parse(stored) as AccountUser
  } catch {
    return null
  }
}

export function onSessionChange(callback: () => void) {
  window.addEventListener(sessionEvent, callback)
  window.addEventListener('storage', callback)
  return () => {
    window.removeEventListener(sessionEvent, callback)
    window.removeEventListener('storage', callback)
  }
}

async function request<T>(path: string, init: RequestInit, parseJson = true): Promise<T> {
  let response: Response
  try {
    response = await fetch(`${apiBase}${path}`, init)
  } catch {
    throw new Error('The FinSim account service is not running. Start the API and try again.')
  }
  if (!response.ok) {
    const payload = await response.json().catch(() => null)
    if (response.status === 401 && !path.includes('/signin')) {
      clearSession()
    }
    throw new Error(payload?.detail || `Account service returned ${response.status}.`)
  }
  if (!parseJson) return undefined as T
  return response.json() as Promise<T>
}
