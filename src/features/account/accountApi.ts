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

async function request<T>(path: string, init: RequestInit): Promise<T> {
  let response: Response
  try {
    response = await fetch(`${apiBase}${path}`, init)
  } catch {
    throw new Error('The FinSim account service is not running. Start the API and try again.')
  }
  if (!response.ok) {
    const payload = await response.json().catch(() => null)
    throw new Error(payload?.detail || `Account service returned ${response.status}.`)
  }
  return response.json() as Promise<T>
}
