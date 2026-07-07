import { authHeaders, clearSession } from '../account/accountApi'

export type ProcessingJob = {
  job_id: string
  status: 'processing' | 'review' | 'complete' | 'error'
  stage: string
  progress: number
  filenames: string[]
  review_count: number
  transaction_count: number
  error: string | null
}

export type ApiReviewItem = {
  id: string
  transaction_ids: string[]
  occurrence_count: number
  merchant: string
  description: string
  posted_at: string
  amount: string
  confidence: number
  suggestions: string[]
  category?: string
  category_source?: string
  review_reasons?: string[]
  review_summary?: string
}

export type ReviewResponse = {
  job_id: string
  items: ApiReviewItem[]
  categories: string[]
}

export type FeedbackDecision = {
  transaction_ids: string[]
  category: string
  remember_merchant: boolean
}

export type AnalyticsReport = {
  monthly_summaries: Array<{
    month: string
    income: string
    spending: string
    net_cash_flow: string
    transaction_count: number
    review_count: number
  }>
  category_breakdown: Array<{
    month: string
    category: string
    spending: string
    transaction_count: number
    share_of_month: string
  }>
  spending_trends: Array<{
    month: string
    category: string
    previous_spending: string
    current_spending: string
    change_amount: string
    change_percent: string | null
    direction: 'up' | 'down' | 'flat'
  }>
  anomaly_candidates: Array<{
    transaction_id: string
    posted_at: string
    merchant: string
    category: string
    amount: string
    reason: string
    severity: 'low' | 'medium' | 'high'
  }>
  forecast: {
    target_month: string
    expected_spending: string
    low: string
    high: string
    method: string
    confidence: string
  } | null
  warnings: string[]
}

export type ProcessingResult = {
  job_id: string
  status: 'complete'
  transactions: Array<Record<string, string>>
  quality_report: {
    output_rows: number
    review_rows: number
    internal_transfer_matches?: number
    warnings: string[]
  }
  analytics: AnalyticsReport
  feedback_audit: Array<Record<string, string | boolean>>
  remembered_merchant_count: number
  reviewed_merchant_count: number
}

const apiBase = (import.meta.env.VITE_PROCESSING_API_URL || 'http://127.0.0.1:8000').replace(/\/$/, '')

export async function createProcessingJob(files: File[]) {
  const body = new FormData()
  files.forEach((file) => body.append('files', file))
  return request<ProcessingJob>('/api/processing-jobs', {
    method: 'POST',
    headers: authHeaders(),
    body,
  })
}

export function getProcessingJob(jobId: string) {
  return request<ProcessingJob>(`/api/processing-jobs/${jobId}`, {
    headers: authHeaders(),
  })
}

export function getReviewItems(jobId: string) {
  return request<ReviewResponse>(`/api/processing-jobs/${jobId}/review`, {
    headers: authHeaders(),
  })
}

export function submitFeedback(jobId: string, decisions: FeedbackDecision[]) {
  return request<ProcessingJob>(`/api/processing-jobs/${jobId}/feedback`, {
    method: 'POST',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(decisions),
  })
}

export function getProcessingResult(jobId: string) {
  return request<ProcessingResult>(`/api/processing-jobs/${jobId}/result`, {
    headers: authHeaders(),
  })
}

export async function deleteProcessingJob(jobId: string) {
  const response = await fetch(`${apiBase}/api/processing-jobs/${jobId}`, {
    method: 'DELETE',
    headers: authHeaders(),
  })
  if (!response.ok && response.status !== 404) {
    throw new Error('The temporary processing job could not be removed.')
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response
  try {
    response = await fetch(`${apiBase}${path}`, init)
  } catch {
    throw new Error('The FinSim processing service is not running. Start the API and try again.')
  }
  if (!response.ok) {
    const payload = await response.json().catch(() => null)
    if (response.status === 401) {
      clearSession()
      throw new Error('Your session expired. Please sign in again before processing statements.')
    }
    throw new Error(payload?.detail || `Processing service returned ${response.status}.`)
  }
  return response.json() as Promise<T>
}
