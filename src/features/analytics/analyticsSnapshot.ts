import { useEffect, useState } from 'react'
import type { ProcessingResult } from '../statements/processingApi'
import { authHeaders, clearSession, getSessionToken, onSessionChange } from '../account/accountApi'

export type MonthlySummary = {
  month: string
  income: string
  spending: string
  net_cash_flow: string
  transaction_count: number
  review_count: number
}

export type CategoryBreakdown = {
  month: string
  category: string
  spending: string
  transaction_count: number
  share_of_month: string
}

export type SpendingTrend = {
  month: string
  category: string
  previous_spending: string
  current_spending: string
  change_amount: string
  change_percent: string | null
  direction: 'up' | 'down' | 'flat'
}

export type AnomalyCandidate = {
  transaction_id: string
  posted_at: string
  merchant: string
  category: string
  amount: string
  reason: string
  severity: 'low' | 'medium' | 'high'
}

export type ForecastRange = {
  target_month: string
  expected_spending: string
  low: string
  high: string
  method: string
  confidence: string
}

export type AnalyticsReport = {
  monthly_summaries: MonthlySummary[]
  category_breakdown: CategoryBreakdown[]
  spending_trends: SpendingTrend[]
  anomaly_candidates: AnomalyCandidate[]
  forecast: ForecastRange | null
  warnings: string[]
}

export type AnalyticsSnapshot = {
  source: 'sample' | 'local-processing' | 'saved-account' | 'empty-account'
  updatedAt: string
  transactionCount: number
  reviewedMerchantCount: number
  qualityWarningCount: number
  analytics: AnalyticsReport
  transactions: Array<Record<string, string | number | boolean | null>>
}

const storageKey = 'finsim-latest-analytics'
const updateEvent = 'finsim-analytics-updated'
const apiBase = (import.meta.env.VITE_PROCESSING_API_URL || 'http://127.0.0.1:8000').replace(/\/$/, '')

type AccountAnalyticsResponse = {
  source: 'saved-user-transactions'
  transaction_count: number
  generated_at: string
  latest_batch: Record<string, unknown> | null
  analytics: AnalyticsReport
}

export const sampleAnalyticsSnapshot: AnalyticsSnapshot = {
  source: 'sample',
  updatedAt: '2026-06-20T12:00:00.000Z',
  transactionCount: 103,
  reviewedMerchantCount: 3,
  qualityWarningCount: 0,
  transactions: [
    { merchant_clean: 'Whole Foods Market', category: 'Groceries', posted_at: '2026-06-18', amount: '-84.26' },
    { merchant_clean: 'Payroll deposit', category: 'Income', posted_at: '2026-06-15', amount: '3420.00' },
    { merchant_clean: 'Spotify', category: 'Subscriptions', posted_at: '2026-06-14', amount: '-11.99' },
    { merchant_clean: 'Blue Bottle Coffee', category: 'Dining', posted_at: '2026-06-13', amount: '-6.75' },
    { merchant_clean: 'ComEd', category: 'Utilities', posted_at: '2026-06-12', amount: '-92.40' },
  ],
  analytics: {
    monthly_summaries: [
      { month: '2026-04', income: '4200.00', spending: '2315.50', net_cash_flow: '1884.50', transaction_count: 34, review_count: 0 },
      { month: '2026-05', income: '4200.00', spending: '2326.42', net_cash_flow: '1873.58', transaction_count: 35, review_count: 0 },
      { month: '2026-06', income: '4200.00', spending: '2136.42', net_cash_flow: '2063.58', transaction_count: 34, review_count: 0 },
    ],
    category_breakdown: [
      { month: '2026-06', category: 'Housing', spending: '1248.00', transaction_count: 1, share_of_month: '58.42' },
      { month: '2026-06', category: 'Groceries', spending: '420.00', transaction_count: 9, share_of_month: '19.66' },
      { month: '2026-06', category: 'Transport', spending: '220.42', transaction_count: 6, share_of_month: '10.32' },
      { month: '2026-06', category: 'Dining', spending: '148.00', transaction_count: 8, share_of_month: '6.93' },
      { month: '2026-06', category: 'Other', spending: '100.00', transaction_count: 10, share_of_month: '4.68' },
    ],
    spending_trends: [
      { month: '2026-06', category: 'Dining', previous_spending: '290.00', current_spending: '148.00', change_amount: '-142.00', change_percent: '-48.97', direction: 'down' },
      { month: '2026-06', category: 'Groceries', previous_spending: '455.00', current_spending: '420.00', change_amount: '-35.00', change_percent: '-7.69', direction: 'down' },
      { month: '2026-06', category: 'Transport', previous_spending: '205.00', current_spending: '220.42', change_amount: '15.42', change_percent: '7.52', direction: 'up' },
    ],
    anomaly_candidates: [
      { transaction_id: 'sample-rent', posted_at: '2026-06-01', merchant: 'Apartment rent', category: 'Housing', amount: '1248.00', reason: 'Large single transaction', severity: 'high' },
      { transaction_id: 'sample-streaming', posted_at: '2026-06-14', merchant: 'Spotify', category: 'Subscriptions', amount: '11.99', reason: 'Recurring subscription to monitor', severity: 'medium' },
    ],
    forecast: {
      target_month: '2026-07',
      expected_spending: '2260.00',
      low: '2080.00',
      high: '2480.00',
      method: 'three-month average with recent trend',
      confidence: 'medium',
    },
    warnings: [],
  },
}

export const emptyAccountSnapshot: AnalyticsSnapshot = {
  source: 'empty-account',
  updatedAt: new Date().toISOString(),
  transactionCount: 0,
  reviewedMerchantCount: 0,
  qualityWarningCount: 0,
  transactions: [],
  analytics: {
    monthly_summaries: [],
    category_breakdown: [],
    spending_trends: [],
    anomaly_candidates: [],
    forecast: null,
    warnings: ['Upload at least three monthly statements to build your first financial picture. Consecutive months are preferred for stronger trends.'],
  },
}

export function useAnalyticsSnapshot() {
  const [snapshot, setSnapshot] = useState(loadAnalyticsSnapshot)

  useEffect(() => {
    function refresh() {
      setSnapshot(loadAnalyticsSnapshot())
    }
    async function refreshAccountAnalytics() {
      const accountSnapshot = await loadAccountAnalyticsSnapshot().catch(() => null)
      if (accountSnapshot) {
        setSnapshot(accountSnapshot)
        return
      }
      refresh()
    }
    void refreshAccountAnalytics()
    window.addEventListener('storage', refresh)
    window.addEventListener(updateEvent, refresh)
    const removeSessionListener = onSessionChange(() => {
      void refreshAccountAnalytics()
    })
    return () => {
      window.removeEventListener('storage', refresh)
      window.removeEventListener(updateEvent, refresh)
      removeSessionListener()
    }
  }, [])

  return snapshot
}

export function saveProcessingResult(result: ProcessingResult) {
  const snapshot: AnalyticsSnapshot = {
    source: 'local-processing',
    updatedAt: new Date().toISOString(),
    transactionCount: result.transactions.length,
    reviewedMerchantCount: result.reviewed_merchant_count,
    qualityWarningCount: result.quality_report.warnings.length,
    analytics: result.analytics,
    transactions: result.transactions,
  }
  localStorage.setItem(storageKey, JSON.stringify(snapshot))
  window.dispatchEvent(new Event(updateEvent))
}

export function clearCachedAnalytics() {
  localStorage.removeItem(storageKey)
  window.dispatchEvent(new Event(updateEvent))
}

export function updateCachedTransactionCategory(transactionId: string, category: string) {
  const stored = localStorage.getItem(storageKey)
  if (!stored) return false
  try {
    const snapshot = JSON.parse(stored) as AnalyticsSnapshot
    let changed = false
    snapshot.transactions = snapshot.transactions.map((row) => {
      if (String(row.transaction_id || '') !== transactionId) return row
      changed = true
      return {
        ...row,
        category,
        category_source: 'user_edit',
        category_confidence: '1.00',
        needs_review: false,
      }
    })
    if (!changed) return false
    snapshot.updatedAt = new Date().toISOString()
    localStorage.setItem(storageKey, JSON.stringify(snapshot))
    window.dispatchEvent(new Event(updateEvent))
    return true
  } catch {
    return false
  }
}

export async function refreshSavedAccountAnalytics() {
  const snapshot = await loadAccountAnalyticsSnapshot()
  if (!snapshot) return null
  localStorage.setItem(storageKey, JSON.stringify(snapshot))
  window.dispatchEvent(new Event(updateEvent))
  return snapshot
}

export function loadAnalyticsSnapshot(): AnalyticsSnapshot {
  if (getSessionToken()) return emptyAccountSnapshot
  const stored = localStorage.getItem(storageKey)
  if (!stored) return sampleAnalyticsSnapshot
  try {
    const parsed = JSON.parse(stored) as AnalyticsSnapshot
    if (!parsed.analytics?.monthly_summaries?.length) return sampleAnalyticsSnapshot
    return parsed
  } catch {
    return sampleAnalyticsSnapshot
  }
}

async function loadAccountAnalyticsSnapshot(): Promise<AnalyticsSnapshot | null> {
  if (!getSessionToken()) return null
  const [accountAnalytics, transactions] = await Promise.all([
    apiRequest<AccountAnalyticsResponse>('/api/accounts/analytics'),
    apiRequest<{ items: Array<Record<string, string | number | boolean | null>> }>('/api/accounts/transactions?limit=500'),
  ])
  if (!accountAnalytics.transaction_count || !accountAnalytics.analytics.monthly_summaries.length) {
    localStorage.removeItem(storageKey)
    return { ...emptyAccountSnapshot, updatedAt: accountAnalytics.generated_at }
  }
  const snapshot: AnalyticsSnapshot = {
    source: 'saved-account',
    updatedAt: accountAnalytics.generated_at,
    transactionCount: accountAnalytics.transaction_count,
    reviewedMerchantCount: Number(accountAnalytics.latest_batch?.review_count || 0),
    qualityWarningCount: accountAnalytics.analytics.warnings.length,
    analytics: accountAnalytics.analytics,
    transactions: transactions.items,
  }
  localStorage.setItem(storageKey, JSON.stringify(snapshot))
  return snapshot
}

async function apiRequest<T>(path: string): Promise<T> {
  const response = await fetch(`${apiBase}${path}`, {
    headers: authHeaders(),
  })
  if (!response.ok) {
    const payload = await response.json().catch(() => null)
    if (response.status === 401) {
      localStorage.removeItem(storageKey)
      clearSession()
      throw new Error('Your session expired. Please sign in again.')
    }
    throw new Error(payload?.detail || `Analytics service returned ${response.status}.`)
  }
  return response.json() as Promise<T>
}

export function latestMonth(snapshot: AnalyticsSnapshot) {
  return snapshot.analytics.monthly_summaries.at(-1) || sampleAnalyticsSnapshot.analytics.monthly_summaries.at(-1)!
}

export function previousMonth(snapshot: AnalyticsSnapshot) {
  const summaries = snapshot.analytics.monthly_summaries
  return summaries.at(-2) || summaries.at(-1) || sampleAnalyticsSnapshot.analytics.monthly_summaries.at(-2)!
}

export function latestCategories(snapshot: AnalyticsSnapshot) {
  const month = latestMonth(snapshot).month
  return snapshot.analytics.category_breakdown
    .filter((row) => row.month === month)
    .sort((left, right) => Number(right.spending) - Number(left.spending))
}

export function recentTransactions(snapshot: AnalyticsSnapshot) {
  return snapshot.transactions
    .slice()
    .sort((left, right) => String(right.posted_at).localeCompare(String(left.posted_at)))
    .slice(0, 6)
}

export function topTrend(snapshot: AnalyticsSnapshot) {
  return snapshot.analytics.spending_trends
    .slice()
    .sort((left, right) => Math.abs(Number(right.change_amount)) - Math.abs(Number(left.change_amount)))[0]
}

export function formatMoney(value: string | number) {
  const amount = Number(value || 0)
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: Math.abs(amount) >= 1000 ? 0 : 2,
  }).format(amount)
}

export function formatMonthLabel(month: string) {
  const [year, monthNumber] = month.split('-').map(Number)
  return new Date(year, monthNumber - 1, 1).toLocaleDateString('en-US', {
    month: 'short',
    year: 'numeric',
  })
}

export function sourceLabel(snapshot: AnalyticsSnapshot) {
  if (snapshot.source === 'saved-account') return 'Account data'
  if (snapshot.source === 'empty-account') return 'No statements yet'
  return snapshot.source === 'local-processing' ? 'Local statement data' : 'Sample data'
}
