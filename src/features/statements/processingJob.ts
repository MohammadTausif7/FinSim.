export type JobState = 'idle' | 'processing' | 'review' | 'finalizing' | 'complete'

export type StatementFile = {
  id: string
  name: string
  size: number
  periodLabel: string
}

export type ReviewItem = {
  id: string
  merchant: string
  description: string
  postedAt: string
  amount: string
  confidence: number
  suggestions: string[]
  resolvedCategory?: string
  rememberMerchant?: boolean
}

export const minimumStatementCount = 3
export const maximumStatementBytes = 25 * 1024 * 1024

// The interface listens to named job stages rather than inventing progress from
// elapsed time. A backend can publish these same values without changing the UI.
export const processingStages = [
  { id: 'validate', label: 'Validating statements', detail: 'Checking file type, count and duplicates', progress: 14 },
  { id: 'extract', label: 'Reading transactions', detail: 'Soumya parser and reconciliation', progress: 42 },
  { id: 'periods', label: 'Checking monthly coverage', detail: 'Confirming distinct statement periods', progress: 58 },
  { id: 'clean', label: 'Cleaning descriptions', detail: 'Normalizing merchants and removing duplicates', progress: 74 },
  { id: 'categorize', label: 'Categorizing spending', detail: 'Applying Sahasra rules and confidence scores', progress: 90 },
] as const

export const sampleStatements: StatementFile[] = [
  { id: 'sample-apr', name: 'checking_april_2026.pdf', size: 842_000, periodLabel: 'April 2026' },
  { id: 'sample-may', name: 'checking_may_2026.pdf', size: 916_000, periodLabel: 'May 2026' },
  { id: 'sample-jun', name: 'checking_june_2026.pdf', size: 884_000, periodLabel: 'June 2026' },
]

export const sampleReviewItems: ReviewItem[] = [
  {
    id: 'review-1',
    merchant: 'Northstar Market',
    description: 'NORTHSTAR MKTPLACE 0421',
    postedAt: 'June 7, 2026',
    amount: '$42.50',
    confidence: 34,
    suggestions: ['Groceries', 'Shopping', 'Dining'],
  },
  {
    id: 'review-2',
    merchant: 'Riverfront Services',
    description: 'RIVERFRONT SVCS MONTHLY',
    postedAt: 'June 12, 2026',
    amount: '$28.00',
    confidence: 41,
    suggestions: ['Services', 'Subscriptions', 'Utilities'],
  },
  {
    id: 'review-3',
    merchant: 'Corner House',
    description: 'CORNER HOUSE POS 7782',
    postedAt: 'June 18, 2026',
    amount: '$19.75',
    confidence: 37,
    suggestions: ['Dining', 'Shopping', 'Other'],
  },
]

export const allCategories = [
  'Dining',
  'Education',
  'Entertainment',
  'Groceries',
  'Healthcare',
  'Housing',
  'Services',
  'Shopping',
  'Subscriptions',
  'Transport',
  'Travel',
  'Utilities',
  'Other',
]

export function formatFileSize(bytes: number) {
  return `${(bytes / 1_000_000).toFixed(1)} MB`
}
