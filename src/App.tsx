import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react'
import { Link, Navigate, NavLink, Route, Routes, useLocation, useNavigate } from 'react-router-dom'
import StatementProcessingWorkspace from './features/statements/StatementProcessingWorkspace'
import { getStoredUser, onSessionChange, signin, signout, signup, updateAccountSettings, verifyEmail } from './features/account/accountApi'
import {
  clearCachedAnalytics,
  formatMoney,
  formatMonthLabel,
  latestCategories,
  latestMonth,
  recentTransactions,
  sampleAnalyticsSnapshot,
  sourceLabel,
  topTrend,
  useAnalyticsSnapshot,
  type AnomalyCandidate,
  type AnalyticsSnapshot,
} from './features/analytics/analyticsSnapshot'
import {
  ArrowDownRight,
  ArrowRight,
  ArrowUpRight,
  BarChart3,
  Bell,
  BrainCircuit,
  Check,
  ChevronRight,
  FileCheck2,
  FileText,
  Gauge,
  Landmark,
  LockKeyhole,
  Menu,
  Moon,
  MoreHorizontal,
  ReceiptText,
  Settings,
  ShieldCheck,
  Sparkles,
  Sun,
  Target,
  TrendingUp,
  Upload,
  User,
  X,
  Zap,
  type LucideIcon,
} from 'lucide-react'

type Theme = 'light' | 'dark'
type ChartMetric = 'spending' | 'income' | 'net_cash_flow'
type MonthlyChartPoint = { month: string; label: string; value: number | null }
type ForecastEstimate = { expected: number; low: number; high: number; method: string; confidence: string }

const chartMetricLabels: Record<ChartMetric, string> = {
  spending: 'Spending',
  income: 'Income',
  net_cash_flow: 'Net cash flow',
}

const anomalyReviewPrefix = 'finsim-reviewed-anomalies'
const budgetTargetPrefix = 'finsim-budget-targets'

// These records are intentionally fictional. They let us build and review the
// interface without putting anyone's real financial history in the repository.
const transactions = [
  { merchant: 'Whole Foods Market', category: 'Groceries', date: 'Jun 18', amount: '-$84.26', icon: 'WF', tone: 'green' },
  { merchant: 'Payroll deposit', category: 'Income', date: 'Jun 15', amount: '+$3,420.00', icon: 'PD', tone: 'blue' },
  { merchant: 'Spotify', category: 'Subscriptions', date: 'Jun 14', amount: '-$11.99', icon: 'SP', tone: 'lime' },
  { merchant: 'Blue Bottle Coffee', category: 'Dining', date: 'Jun 13', amount: '-$6.75', icon: 'BB', tone: 'orange' },
  { merchant: 'ComEd', category: 'Utilities', date: 'Jun 12', amount: '-$92.40', icon: 'CE', tone: 'violet' },
]

const categories = [
  { name: 'Housing', value: 38, amount: '$1,248', color: '#101418' },
  { name: 'Food & dining', value: 24, amount: '$788', color: '#2f72ff' },
  { name: 'Transport', value: 16, amount: '$526', color: '#8aaeff' },
  { name: 'Shopping', value: 12, amount: '$394', color: '#b9ceff' },
  { name: 'Other', value: 10, amount: '$328', color: '#e5ebf7' },
]

const categoryColors = ['#2563eb', '#7c3aed', '#059669', '#f97316', '#e11d48', '#0891b2', '#ca8a04', '#64748b']
const merchantTones = ['green', 'blue', 'lime', 'orange', 'violet']

function categoryColor(index: number) {
  return categoryColors[index % categoryColors.length]
}

function monthCategoryRows(snapshot: AnalyticsSnapshot) {
  const rows = latestCategories(snapshot)
  if (!rows.length) return categories
  return rows.map((row, index) => ({
    name: row.category,
    value: Number(row.share_of_month),
    amount: formatMoney(row.spending),
    color: categoryColor(index),
  }))
}

function transactionPreview(snapshot: AnalyticsSnapshot) {
  const rows = recentTransactions(snapshot)
  if (!rows.length) return snapshot.source === 'sample' ? transactions : []
  return rows.map((row, index) => {
    const merchant = String(row.merchant_clean || row.description_raw || 'Transaction')
    const amount = Number(row.amount || 0)
    return {
      merchant,
      category: String(row.category || 'Other'),
      date: row.posted_at ? formatMonthLabel(String(row.posted_at).slice(0, 7)) : 'Recent',
      amount: `${amount >= 0 ? '+' : ''}${formatMoney(amount)}`,
      icon: merchant.slice(0, 2).toUpperCase(),
      tone: merchantTones[index % merchantTones.length],
    }
  })
}

function hasFinancialData(snapshot: AnalyticsSnapshot) {
  return snapshot.transactionCount > 0 && snapshot.analytics.monthly_summaries.length > 0
}

function addMonths(month: string, offset: number) {
  const [year, monthNumber] = month.split('-').map(Number)
  const date = new Date(year, monthNumber - 1 + offset, 1)
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
}

function monthlySeries(snapshot: AnalyticsSnapshot, metric: ChartMetric, limit: number): MonthlyChartPoint[] {
  const summaries = snapshot.analytics.monthly_summaries.length
    ? snapshot.analytics.monthly_summaries
    : sampleAnalyticsSnapshot.analytics.monthly_summaries
  const byMonth = new Map(summaries.map((row) => [row.month, Number(row[metric] || 0)]))
  const latest = summaries.at(-1)?.month || sampleAnalyticsSnapshot.analytics.monthly_summaries.at(-1)!.month
  return Array.from({ length: limit }, (_, index) => {
    const month = addMonths(latest, index - limit + 1)
    return {
      month,
      label: formatMonthLabel(month).slice(0, 3).toUpperCase(),
      value: byMonth.get(month) ?? null,
    }
  })
}

function nextMonth(month: string) {
  return addMonths(month, 1)
}

function compactMoney(value: number) {
  const abs = Math.abs(value)
  if (abs >= 1000) return `${value < 0 ? '-' : ''}$${(abs / 1000).toFixed(abs >= 10000 ? 0 : 1)}k`
  return formatMoney(value)
}

function isValidEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())
}

function analysisPeriodLabel(snapshot: AnalyticsSnapshot) {
  const months = Array.from(new Set(snapshot.analytics.monthly_summaries.map((row) => row.month))).sort()
  if (!months.length) return 'No statement period yet'
  if (months.length === 1) return `${formatMonthLabel(months[0])} analysis`
  return `${formatMonthLabel(months[0])} to ${formatMonthLabel(months.at(-1)!)} · ${months.length} months`
}

function snapshotStorageId(snapshot: AnalyticsSnapshot) {
  return `${snapshot.source}-${snapshot.updatedAt}-${snapshot.transactionCount}`
}

function smoothPath(points: Array<{ x: number; y: number }>) {
  if (!points.length) return ''
  if (points.length === 1) return `M${points[0].x} ${points[0].y}`
  return points.reduce((path, point, index) => {
    if (index === 0) return `M${point.x} ${point.y}`
    const previous = points[index - 1]
    const midX = (previous.x + point.x) / 2
    return `${path} Q${previous.x} ${previous.y} ${midX} ${(previous.y + point.y) / 2} T${point.x} ${point.y}`
  }, '')
}

function estimateSpendingValues(spending: number[]): ForecastEstimate {
  if (spending.length < 3) {
    const expected = spending.reduce((sum, value) => sum + value, 0) / Math.max(1, spending.length)
    const buffer = Math.max(expected * 0.15, 75)
    return { expected, low: Math.max(0, expected - buffer), high: expected + buffer, method: 'short history average', confidence: 'low' }
  }
  const alpha = 0.55
  const beta = 0.25
  const dampening = 0.7
  let level = spending[0]
  let trend = spending[1] - spending[0]
  const errors: number[] = []
  for (let index = 1; index < spending.length; index += 1) {
    const forecast = Math.max(0, level + dampening * trend)
    errors.push(Math.abs(spending[index] - forecast))
    const previousLevel = level
    level = alpha * spending[index] + (1 - alpha) * (level + trend)
    trend = beta * (level - previousLevel) + (1 - beta) * trend
  }
  const expected = Math.max(0, level + dampening * trend)
  const averageError = errors.reduce((sum, value) => sum + value, 0) / Math.max(1, errors.length)
  const buffer = Math.max(averageError * 1.15, expected * 0.08, 75)
  return {
    expected,
    low: Math.max(0, expected - buffer),
    high: expected + buffer,
    method: 'exponential smoothing with damped trend',
    confidence: spending.length >= 6 ? 'high' : 'medium',
  }
}

function estimateNextMonth(snapshot: AnalyticsSnapshot) {
  const summaries = snapshot.analytics.monthly_summaries.length
    ? snapshot.analytics.monthly_summaries
    : sampleAnalyticsSnapshot.analytics.monthly_summaries
  const spending = summaries.map((row) => Number(row.spending || 0))
  const targetMonth = nextMonth(summaries.at(-1)?.month || latestMonth(snapshot).month)
  return { targetMonth, ...estimateSpendingValues(spending) }
}

function forecastAccuracyRows(snapshot: AnalyticsSnapshot) {
  const summaries = snapshot.analytics.monthly_summaries
  return summaries
    .map((row, index) => {
      if (index < 3) return null
      const previousMonths = summaries.slice(0, index).map((item) => Number(item.spending || 0))
      const estimate = estimateSpendingValues(previousMonths)
      const actual = Number(row.spending || 0)
      const error = actual - estimate.expected
      const accuracy = actual > 0 ? Math.max(0, 100 - (Math.abs(error) / actual) * 100) : 100
      return {
        month: row.month,
        expected: estimate.expected,
        actual,
        error,
        accuracy,
      }
    })
    .filter((row): row is NonNullable<typeof row> => Boolean(row))
}

function recurringItems(snapshot: AnalyticsSnapshot) {
  const groups = new Map<string, { merchant: string; category: string; amounts: number[]; months: Set<string> }>()
  snapshot.transactions.forEach((row) => {
    const merchant = String(row.merchant_clean || row.merchant || row.description_raw || '').trim()
    if (!merchant) return
    const category = String(row.category || 'Other')
    const amount = Math.abs(Number(row.amount || 0))
    const month = String(row.posted_at || '').slice(0, 7)
    if (!month || !amount) return
    const key = merchant.toLowerCase()
    const existing = groups.get(key) || { merchant, category, amounts: [], months: new Set<string>() }
    existing.amounts.push(amount)
    existing.months.add(month)
    groups.set(key, existing)
  })

  const recurringCategories = new Set(['Housing', 'Subscriptions', 'Utilities', 'Insurance', 'Services'])
  return Array.from(groups.values())
    .map((group) => {
      const average = group.amounts.reduce((sum, value) => sum + value, 0) / group.amounts.length
      const monthCount = group.months.size
      const isLikelyRecurring = monthCount >= 2 || recurringCategories.has(group.category)
      return {
        ...group,
        average,
        monthCount,
        isLikelyRecurring,
        cadence: monthCount >= 2 ? `${monthCount} months observed` : 'Likely scheduled payment',
      }
    })
    .filter((group) => group.isLikelyRecurring)
    .sort((a, b) => b.monthCount - a.monthCount || b.average - a.average)
}

function anomalyReviewKey(snapshot: AnalyticsSnapshot) {
  return `${anomalyReviewPrefix}:${snapshotStorageId(snapshot)}`
}

function loadReviewedAnomalies(key: string) {
  try {
    const parsed = JSON.parse(localStorage.getItem(key) || '[]')
    return Array.isArray(parsed) ? parsed.map(String) : []
  } catch {
    return []
  }
}

function saveReviewedAnomalies(key: string, ids: string[]) {
  localStorage.setItem(key, JSON.stringify(Array.from(new Set(ids))))
}

function budgetTargetKey(snapshot: AnalyticsSnapshot) {
  return `${budgetTargetPrefix}:${snapshot.source}`
}

function loadBudgetTargets(key: string) {
  try {
    const parsed = JSON.parse(localStorage.getItem(key) || '{}') as Record<string, number>
    return Object.fromEntries(Object.entries(parsed).filter(([, value]) => Number.isFinite(Number(value))))
  } catch {
    return {}
  }
}

function saveBudgetTargets(key: string, targets: Record<string, number>) {
  localStorage.setItem(key, JSON.stringify(targets))
}

function anomalyExplanation(item: AnomalyCandidate) {
  const reason = item.reason.toLowerCase()
  if (reason.includes('large')) return 'This transaction is much larger than normal account activity, so FinSim separates it for a quick confirmation.'
  if (reason.includes('recurring') || reason.includes('subscription')) return 'This looks like a repeated bill or subscription. Reviewing it helps catch forgotten recurring charges.'
  if (reason.includes('uncertain') || reason.includes('confidence')) return 'The category confidence was low, so your review can improve future categorization.'
  return 'This charge stands out by amount, timing or category pattern compared with the processed statement history.'
}

function insightPatterns(snapshot: AnalyticsSnapshot, rows: ReturnType<typeof monthCategoryRows>, trend: ReturnType<typeof topTrend>, openAnomalyCount?: number) {
  const current = latestMonth(snapshot)
  const topCategory = rows[0]
  const netCashFlow = Number(current.net_cash_flow)
  const income = Math.max(Number(current.income), 1)
  const savingsRate = Math.round((netCashFlow / income) * 100)
  const anomalyCount = openAnomalyCount ?? snapshot.analytics.anomaly_candidates.length
  const patterns = [
    {
      title: topCategory ? `${topCategory.name} drives ${topCategory.value.toFixed(0)}% of spend` : 'Spending mix needs more data',
      body: topCategory
        ? `${topCategory.amount} is concentrated in one category. If this is expected, keep it. If not, this is the first place to review.`
        : 'Upload statements to reveal category concentration.',
      signal: topCategory && topCategory.value > 45 ? 'High concentration' : 'Balanced mix',
      icon: Landmark,
      tone: 'blue',
    },
    {
      title: netCashFlow >= 0 ? `${savingsRate}% of income remained` : `${formatMoney(Math.abs(netCashFlow))} cash flow gap`,
      body: netCashFlow >= 0
        ? `Income covered spending for ${formatMonthLabel(current.month)}. This gives the forecast room to plan savings.`
        : `Spending ran above income this month. Forecast controls can show how much needs to move next month.`,
      signal: netCashFlow >= 0 ? 'Healthy buffer' : 'Needs attention',
      icon: Gauge,
      tone: netCashFlow >= 0 ? 'green' : 'amber',
    },
    {
      title: trend ? `${trend.category} moved ${trend.direction}` : 'Trend movement is still forming',
      body: trend
        ? `${trend.category} changed by ${formatMoney(trend.change_amount)} compared with the previous month. Watch if this keeps repeating.`
        : 'FinSim needs another month of activity before it can show a clear movement pattern.',
      signal: trend?.change_percent ? `${Math.abs(Number(trend.change_percent)).toFixed(0)}% change` : 'No strong trend',
      icon: TrendingUp,
      tone: 'violet',
    },
    {
      title: anomalyCount ? `${anomalyCount} charges deserve review` : 'No obvious anomalies found',
      body: anomalyCount
        ? 'Large, unusual or recurring charges are separated from normal spending so review stays focused.'
        : 'The latest run did not find charges that strongly stand out from the current statement history.',
      signal: anomalyCount ? 'Review queue' : 'Looks normal',
      icon: Target,
      tone: anomalyCount ? 'rose' : 'green',
    },
  ]
  return patterns
}

function EmptyWorkspace({ title, message }: { title: string; message: string }) {
  return (
    <section className="empty-workspace panel">
      <span><Upload /></span>
      <div>
        <span className="overline">NO STATEMENTS YET</span>
        <h2>{title}</h2>
        <p>{message}</p>
        <Link className="button button-primary button-compact" to="/statements">Upload statements <ArrowRight size={15} /></Link>
      </div>
    </section>
  )
}

function AnomalyDialog({
  items,
  onClose,
  onClear,
  onClearAll,
}: {
  items: AnomalyCandidate[]
  onClose: () => void
  onClear: (transactionId: string) => void
  onClearAll: () => void
}) {
  const rows = items.length ? items : []
  return (
    <div className="review-backdrop" role="presentation">
      <section className="review-dialog insight-dialog" role="dialog" aria-modal="true" aria-labelledby="anomaly-dialog-title">
        <div className="review-dialog-head">
          <div><span className="overline">ANOMALY REVIEW</span><h2 id="anomaly-dialog-title">{rows.length ? 'Transactions worth checking' : 'No anomalies, all verified'}</h2></div>
          <button autoFocus onClick={onClose} aria-label="Close anomaly details"><X /></button>
        </div>
        <p className="dialog-intro">These are not automatically wrong. FinSim shows why each item was flagged so you can mark the charge as verified when it looks correct.</p>
        <div className="dialog-list">
          {rows.length ? rows.map((item) => <div className="dialog-row anomaly-row" key={item.transaction_id}>
            <span className={`severity-dot ${item.severity}`}/>
            <div><strong>{item.merchant}</strong><small>{item.reason} · {item.category} · {item.posted_at ? formatMonthLabel(item.posted_at.slice(0, 7)) : 'Latest data'}</small><p>{anomalyExplanation(item)}</p></div>
            <b>{formatMoney(item.amount)}</b>
            <button type="button" onClick={() => onClear(item.transaction_id)}>Mark verified</button>
          </div>) : <div className="dialog-row verified-row"><span className="severity-dot low"/><div><strong>No anomalies, all verified</strong><small>Every surfaced item has been reviewed or this data set did not produce anomaly candidates.</small></div><b>✓</b></div>}
        </div>
        {rows.length > 0 && <div className="review-dialog-foot"><button type="button" onClick={onClearAll}><Check /> Mark all verified</button><span>Verified items disappear from the open anomaly count for this statement run.</span></div>}
      </section>
    </div>
  )
}

function InsightDialog({ snapshot, trend, onClose }: { snapshot: AnalyticsSnapshot; trend: ReturnType<typeof topTrend>; onClose: () => void }) {
  const current = latestMonth(snapshot)
  const topCategory = monthCategoryRows(snapshot)[0]
  return (
    <div className="review-backdrop" role="presentation">
      <section className="review-dialog insight-dialog" role="dialog" aria-modal="true" aria-labelledby="insight-dialog-title">
        <div className="review-dialog-head">
          <div><span className="overline">FINSIM INSIGHT</span><h2 id="insight-dialog-title">What changed this month</h2></div>
          <button autoFocus onClick={onClose} aria-label="Close insight"><X /></button>
        </div>
        <div className="insight-summary-grid">
          <div><span>Total spending</span><strong>{formatMoney(current.spending)}</strong><small>{formatMonthLabel(current.month)}</small></div>
          <div><span>Largest category</span><strong>{topCategory?.name || 'Not available'}</strong><small>{topCategory?.amount || '$0'}</small></div>
          <div><span>Trend signal</span><strong>{trend ? `${trend.direction}` : 'flat'}</strong><small>{trend ? `${trend.category} changed by ${formatMoney(trend.change_amount)}` : 'No strong movement detected'}</small></div>
        </div>
        <p className="dialog-intro">Use this as a starting point. The detailed sections below show the spending mix, anomalies and recent transactions behind this summary.</p>
      </section>
    </div>
  )
}

const typeWords = ['clear.', 'predictable.', 'simpler.']

function Logo({ compact = false }: { compact?: boolean }) {
  // The three bars are drawn in CSS, so the first version of the brand does not
  // depend on an external image file that can go missing during deployment.
  return (
    <Link className="logo" to="/" aria-label="FinSim home">
      <span className="logo-mark" aria-hidden="true"><i /><i /><i /></span>
      {!compact && <span>FinSim<span className="brand-dot">.</span></span>}
    </Link>
  )
}

function ThemeButton({ theme, setTheme }: { theme: Theme; setTheme: (theme: Theme) => void }) {
  return (
    <button className="icon-button" onClick={() => setTheme(theme === 'light' ? 'dark' : 'light')} aria-label={`Use ${theme === 'light' ? 'dark' : 'light'} theme`}>
      {theme === 'light' ? <Moon size={18} /> : <Sun size={18} />}
    </button>
  )
}

function PublicNav({ theme, setTheme }: { theme: Theme; setTheme: (theme: Theme) => void }) {
  const [open, setOpen] = useState(false)
  return (
    <header className="public-nav">
      <div className="nav-inner">
        <Logo />
        <nav className={open ? 'public-links open' : 'public-links'} aria-label="Main navigation">
          <a href="/#how-it-works" onClick={() => setOpen(false)}>How it works</a>
          <a href="/#features" onClick={() => setOpen(false)}>Features</a>
          <Link to="/statements" onClick={() => setOpen(false)}>Open app</Link>
        </nav>
        <div className="nav-actions">
          <ThemeButton theme={theme} setTheme={setTheme} />
          <Link className="text-link hide-mobile" to="/signin">Sign in</Link>
          <Link className="button button-small" to="/signup">Get started <ArrowRight size={15} /></Link>
          <button className="mobile-menu" onClick={() => setOpen(!open)} aria-label="Toggle menu">{open ? <X /> : <Menu />}</button>
        </div>
      </div>
    </header>
  )
}

function HeroDemo() {
  // This is a small product tour, not a second functioning dashboard. Keeping
  // it as markup makes the landing page responsive and lets it adapt to the theme.
  return (
    <div className="hero-demo-wrap">
      <div className="demo-glow" />
      <div className="hero-demo">
        <div className="demo-topbar">
          <span className="demo-logo"><span className="logo-mark tiny"><i /><i /><i /></span> FinSim.</span>
          <span className="demo-avatar">FS</span>
        </div>
        <div className="demo-body">
          <aside className="demo-sidebar">
            <span className="active"><FileText /> Statements</span>
            <span><BarChart3 /> Analytics</span>
            <span><BrainCircuit /> Forecast</span>
            <span><Settings /> Settings</span>
          </aside>
          <div className="demo-content">
            <div className="demo-heading"><div><small>GOOD MORNING</small><strong>Your money, in focus.</strong></div><button><Upload size={13} /> Add statements</button></div>
            <div className="demo-stats">
              <div><small>NET CASH FLOW</small><strong>$1,284.60</strong><em><ArrowUpRight /> 12.4%</em></div>
              <div><small>SPENT THIS MONTH</small><strong>$2,136.42</strong><em className="neutral">68% of plan</em></div>
              <div><small>SMART SAVINGS</small><strong>$692.18</strong><em><ArrowUpRight /> $84 ahead</em></div>
            </div>
            <div className="demo-chart">
              <div className="demo-chart-head"><div><small>SPENDING PULSE</small><strong>$2,136 <span>in June</span></strong></div><span>6 months⌄</span></div>
              <svg viewBox="0 0 620 180" role="img" aria-label="Spending trend chart">
                <defs><linearGradient id="heroFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#3979ff" stopOpacity=".25"/><stop offset="1" stopColor="#3979ff" stopOpacity="0"/></linearGradient></defs>
                <path className="gridline" d="M0 35H620M0 85H620M0 135H620" />
                <path className="area" d="M0 140 C40 132,58 96,103 106 S175 136,210 92 S274 65,316 88 S378 120,420 76 S486 50,518 68 S570 43,620 34 L620 180 L0 180Z" />
                <path className="line" d="M0 140 C40 132,58 96,103 106 S175 136,210 92 S274 65,316 88 S378 120,420 76 S486 50,518 68 S570 43,620 34" />
              </svg>
              <div className="demo-months"><span>JAN</span><span>FEB</span><span>MAR</span><span>APR</span><span>MAY</span><span>JUN</span></div>
            </div>
          </div>
        </div>
      </div>
      <div className="floating-card insight-float"><span><Sparkles size={15} /></span><div><small>FINSIM INSIGHT</small><strong>You spent 18% less on dining</strong></div></div>
      <div className="floating-card secure-float"><ShieldCheck size={18} /><div><strong>3 statements ready</strong><small>Secure workflow</small></div></div>
    </div>
  )
}

function Landing({ theme, setTheme }: { theme: Theme; setTheme: (theme: Theme) => void }) {
  const [word, setWord] = useState(0)

  // Rotate one word at a relaxed pace. The CSS handles the typing animation,
  // while this effect only decides which word should be shown next.
  useEffect(() => {
    const timer = window.setInterval(() => setWord((current) => (current + 1) % typeWords.length), 2200)
    return () => window.clearInterval(timer)
  }, [])

  return (
    <div className="landing">
      <PublicNav theme={theme} setTheme={setTheme} />
      <main>
        <section className="hero section-pad">
          <div className="eyebrow"><span><Sparkles size={13} /></span> Your financial assistant</div>
          <h1>Finance, made <span className="typeword" key={typeWords[word]}>{typeWords[word]}</span></h1>
          <p className="hero-copy">Upload your bank statements. FinSim turns the noise into a clear picture of your spending and helps you plan what comes next.</p>
          <div className="hero-actions">
            <Link to="/signup" className="button button-primary">Start simplifying <ArrowRight size={17} /></Link>
          </div>
          <div className="trust-note"><span><Check size={12} /></span> No credit card <span><Check size={12} /></span> Secure upload flow <span><Check size={12} /></span> No bank credentials</div>
          <HeroDemo />
        </section>

        <section className="trust-strip"><p>Built for a clear statement to insight workflow</p><div><strong>RESPONSIVE DESIGN</strong><strong>LIGHT AND DARK THEMES</strong><strong>LIVE ANALYTICS</strong><strong>FORECAST CONTROLS</strong></div></section>

        <section className="how section-pad" id="how-it-works">
          <div className="section-heading"><span className="overline">FROM PDF TO PERSPECTIVE</span><h2>Your finances, understood<br/>in three quiet steps.</h2><p>FinSim does the tedious work so you can spend your energy on better decisions.</p></div>
          <div className="steps-grid">
            <article><span className="step-number">01</span><div className="step-icon"><Upload /></div><h3>Drop in your statements</h3><p>Start with at least three monthly PDF statements. Consecutive months are preferred for stronger trends.</p><span className="micro-chip"><FileText size={13} /> statement.pdf <Check size={13} /></span></article>
            <article><span className="step-number">02</span><div className="step-icon"><Zap /></div><h3>We make sense of it</h3><p>Transactions are cleaned, matched and categorized into a reliable financial timeline.</p><div className="category-mini"><span>COFFEE SHOP <i>Dining</i></span><span>AMZN MKTPLACE <i>Shopping</i></span></div></article>
            <article><span className="step-number">03</span><div className="step-icon"><TrendingUp /></div><h3>See what comes next</h3><p>Explore trends, surface unusual activity, and model next month's likely spending.</p><div className="forecast-mini"><span>Next month</span><strong>$2,340 to $2,680</strong><svg viewBox="0 0 200 34"><path d="M0 28 C35 25,42 6,76 15 S110 30,140 13 S176 15,200 3" /></svg></div></article>
          </div>
        </section>

        <section className="features section-pad" id="features">
          <div className="section-heading left"><span className="overline">CLARITY THAT COMPOUNDS</span><h2>Less spreadsheet.<br/>More headspace.</h2></div>
          <div className="feature-bento">
            <article className="feature-large"><div className="feature-copy"><span className="feature-icon"><Gauge /></span><h3>One calm financial home</h3><p>Cash flow, spending, savings and recent activity are organized into an insights page you can actually read.</p><Link to="/analytics">Explore insights <ArrowRight size={15} /></Link></div><div className="bento-ui"><div className="bento-balance"><small>AVAILABLE BALANCE</small><strong>$6,482.19</strong><span>Across 2 accounts</span></div><div className="ring"><div><strong>68%</strong><small>of monthly plan</small></div></div></div></article>
            <article><span className="feature-icon blue"><BrainCircuit /></span><h3>A forecast you can shape</h3><p>Adjust rent, groceries or goals and immediately see the range of likely outcomes.</p><div className="slider-mock"><span><i>Dining</i><b>$340</b></span><input type="range" value="62" readOnly /><span><i>Expected range</i><b>$2.3k to $2.7k</b></span></div></article>
            <article><span className="feature-icon amber"><Bell /></span><h3>Quietly watching for the unusual</h3><p>Duplicate charges, spending spikes and surprising subscriptions rise to the surface.</p><div className="alert-mock"><span>!</span><div><strong>Unusual charge</strong><small>$129.00 · Streaming</small></div><ChevronRight /></div></article>
            <article className="security-card" id="security"><span className="feature-icon green"><ShieldCheck /></span><h3>Privacy is part of the workflow</h3><p>FinSim uses account-scoped jobs, PDF checks, short-lived processing files and no bank credential access.</p><div className="security-points"><span><Check /> Authenticated uploads</span><span><Check /> No bank credentials</span><span><Check /> Private local data</span></div></article>
            <article className="statement-card"><span className="feature-icon violet"><ReceiptText /></span><h3>Flexible statement support</h3><p>Built for messy descriptions, changing formats and more than one bank.</p><div className="files-stack"><span>APR <FileCheck2 /></span><span>MAY <FileCheck2 /></span><span>JUN <FileCheck2 /></span></div></article>
          </div>
        </section>

        <section className="cta section-pad"><div className="cta-card"><span className="cta-orb"/><span className="overline">YOUR NEXT MONTH STARTS HERE</span><h2>Money feels lighter<br/>when it makes sense.</h2><p>Bring three statements. We'll bring the perspective.</p><Link className="button button-white" to="/signup">Build my financial picture <ArrowRight /></Link></div></section>
      </main>
      <footer><div className="footer-main"><Logo /><p>Finance, simplified.<br/>Decisions, clarified.</p><div><strong>Product</strong><a href="/#features">Features</a><Link to="/analytics">Insights</Link><Link to="/forecast">Forecast</Link></div><div><strong>Workflow</strong><a href="/#how-it-works">How it works</a><Link to="/statements">Upload statements</Link></div></div><div className="footer-bottom"><span>© 2026 FinSim.</span><span>Statement analytics workspace</span></div></footer>
    </div>
  )
}

function AppShell({ children, theme, setTheme }: { children: ReactNode; theme: Theme; setTheme: (theme: Theme) => void }) {
  const location = useLocation()
  const navigate = useNavigate()
  const [mobileOpen, setMobileOpen] = useState(false)
  const [user, setUser] = useState(getStoredUser)
  const initials = (user?.full_name || user?.email || 'M')
    .split(/[\s@.]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('') || 'M'
  const nav = [
    { to: '/statements', label: 'Statements', icon: FileText },
    { to: '/analytics', label: 'Insights', icon: BarChart3 },
    { to: '/forecast', label: 'Forecast', icon: BrainCircuit },
  ]
  useEffect(() => onSessionChange(() => setUser(getStoredUser())), [])
  async function handleSignout() {
    await signout().catch(() => undefined)
    navigate('/signin')
  }
  return (
    <div className="app-shell">
      <aside className={mobileOpen ? 'app-sidebar open' : 'app-sidebar'}>
        <div className="side-logo"><Logo /></div>
        <nav>
          <span className="nav-label">WORKSPACE</span>
          {nav.map(({ to, label, icon: Icon }) => <NavLink key={to} to={to} onClick={() => setMobileOpen(false)}><Icon size={18} />{label}</NavLink>)}
          <span className="nav-label second">ACCOUNT</span>
          <NavLink to="/settings" onClick={() => setMobileOpen(false)}><Settings size={18} />Settings</NavLink>
        </nav>
        <div className="side-profile"><span>{initials}</span><div><strong>{user?.full_name || 'Guest'}</strong><small>{user ? 'Personal workspace' : 'Sample workspace'}</small></div>{user ? <button className="profile-action" onClick={handleSignout} type="button">Sign out</button> : <MoreHorizontal />}</div>
      </aside>
      <div className="app-main">
        <header className="app-topbar">
          <button className="mobile-menu app-menu" onClick={() => setMobileOpen(!mobileOpen)}><Menu /></button>
          <div className="breadcrumbs"><span>FinSim</span><ChevronRight size={13}/><strong>{location.pathname.slice(1) || 'Statements'}</strong><span className="demo-badge">{user ? 'Account workspace' : 'Example data'}</span></div>
          <div className="top-actions"><ThemeButton theme={theme} setTheme={setTheme}/><Link className="avatar" to="/settings" aria-label="Open settings">{initials}</Link></div>
        </header>
        <main className="page-content">{children}</main>
      </div>
    </div>
  )
}

function PageHeader({ eyebrow, title, children }: { eyebrow: string; title: string; children?: ReactNode }) {
  return <div className="page-header"><div><span className="page-eyebrow">{eyebrow}</span><h1>{title}</h1></div>{children}</div>
}

function MetricCard({ label, value, detail, trend, down, icon: Icon, to, onClick }: { label: string; value: string; detail: string; trend?: string; down?: boolean; icon: LucideIcon; to?: string; onClick?: () => void }) {
  const content = <><div className="metric-top"><span className="metric-icon"><Icon /></span><span className="metric-menu">{to || onClick ? <ArrowRight /> : <MoreHorizontal />}</span></div><span className="metric-label">{label}</span><strong>{value}</strong><div className={down ? 'metric-detail down' : 'metric-detail'}>{trend && <span>{down ? <ArrowDownRight/> : <ArrowUpRight/>}{trend}</span>}<small>{detail}</small></div></>
  if (onClick) return <button className="metric-card metric-card-link" type="button" onClick={onClick}>{content}</button>
  return to ? <Link className="metric-card metric-card-link" to={to}>{content}</Link> : <article className="metric-card">{content}</article>
}

function SpendingChart({ forecast = false, series, metric = 'spending' }: { forecast?: boolean; series?: MonthlyChartPoint[]; metric?: ChartMetric }) {
  const data = series?.length ? series : monthlySeries(sampleAnalyticsSnapshot, metric, 6)
  const lastDataIndex = Math.max(0, data.reduce((last, point, index) => (point.value === null ? last : index), -1))
  const [activeIndex, setActiveIndex] = useState(lastDataIndex)
  const width = 780
  const height = 260
  const left = 70
  const right = 24
  const top = 30
  const bottom = 214
  const values = data.map((point) => point.value).filter((value): value is number => value !== null)
  const domainValues = values.length ? values : [0]
  const min = metric === 'net_cash_flow' ? Math.min(0, ...domainValues) : Math.min(...domainValues)
  const max = Math.max(...domainValues, metric === 'net_cash_flow' ? 0 : 1)
  const range = max - min || 1
  const points = data.map((point, index) => ({
    ...point,
    x: data.length === 1 ? width / 2 : left + (index * (width - left - right)) / (data.length - 1),
    y: point.value === null ? null : top + ((max - point.value) / range) * (bottom - top),
  }))
  const actualPoints = points.filter((point) => point.y !== null && point.value !== null) as Array<typeof points[number] & { y: number; value: number }>
  const linePath = smoothPath(actualPoints)
  const areaPath = actualPoints.length ? `${linePath} L${actualPoints.at(-1)?.x || width} ${bottom} L${actualPoints[0]?.x || left} ${bottom} Z` : ''
  const active = points[Math.min(activeIndex, points.length - 1)]
  const previous = points.slice(0, activeIndex).reverse().find((point) => point.value !== null)
  const activeValue = active?.value
  const previousValue = previous?.value
  const delta = activeValue !== null && activeValue !== undefined && previousValue !== null && previousValue !== undefined ? activeValue - previousValue : 0
  const yTicks = [max, min + range / 2, min]
  return <div className="spending-chart interactive-chart"><div className="chart-readout"><span>{active?.label || 'NOW'}</span><strong>{active?.value === null ? 'No data' : formatMoney(active?.value || 0)}</strong><small className={delta >= 0 ? 'up' : 'down'}>{active?.value === null ? 'No statement for this month' : activeIndex > 0 && previous ? `${delta >= 0 ? '+' : ''}${formatMoney(delta)} from previous point` : chartMetricLabels[metric]}</small></div><svg viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" role="img" aria-label={`${chartMetricLabels[metric]} trend chart`}><defs><linearGradient id={`chartFill-${metric}`} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="var(--accent)" stopOpacity=".25"/><stop offset="1" stopColor="var(--accent)" stopOpacity="0"/></linearGradient></defs>{yTicks.map((tick, index) => <g key={index}><text className="chart-y-label" x="0" y={top + index * ((bottom - top) / 2) + 4}>{compactMoney(tick)}</text><path className="chart-grid" d={`M${left} ${top + index * ((bottom - top) / 2)}H756`}/></g>)}{areaPath && <path className="chart-area" d={areaPath} fill={`url(#chartFill-${metric})`}/>}<path className="chart-line" d={linePath}/>{forecast && actualPoints.at(-1) && <path className="forecast-line" d={`M${actualPoints.at(-1)!.x} ${actualPoints.at(-1)!.y} C700 75 740 96 780 62`}/>} {points.map((point, index) => point.value === null || point.y === null ? <circle key={point.month} className="chart-empty-point" cx={point.x} cy={bottom} r="3" /> : <circle key={point.month} cx={point.x} cy={point.y} r={index === activeIndex ? 7 : 4} onMouseEnter={() => setActiveIndex(index)} onFocus={() => setActiveIndex(index)} tabIndex={0} aria-label={`${point.label}: ${formatMoney(point.value)}`}/>)}</svg><div className="chart-labels">{data.map((point)=><span className={point.value === null ? 'empty' : ''} key={point.month}>{point.label}</span>)}</div></div>
}

function ForecastAccuracyPanel({ snapshot }: { snapshot: AnalyticsSnapshot }) {
  const rows = forecastAccuracyRows(snapshot)
  const latest = rows.at(-1)
  return <article className="panel insight-mini-panel accuracy-panel"><div className="panel-head"><div><span className="overline">FORECAST ACCURACY</span><h2>{latest ? `${Math.round(latest.accuracy)}% accurate for ${formatMonthLabel(latest.month)}` : 'Learning from each month'}</h2></div><span className="confidence"><Gauge size={14}/> actuals</span></div>{latest ? <div className="panel-scroll accuracy-scroll"><div className="accuracy-main"><div><span>Predicted</span><strong>{formatMoney(latest.expected)}</strong></div><div><span>Actual</span><strong>{formatMoney(latest.actual)}</strong></div><div><span>Difference</span><strong className={latest.error > 0 ? 'over' : 'under'}>{latest.error >= 0 ? '+' : ''}{formatMoney(latest.error)}</strong></div></div><div className="accuracy-history">{rows.map((row)=><span key={row.month} title={`${formatMonthLabel(row.month)} forecast accuracy`}><i style={{ height: `${Math.max(10, Math.min(100, row.accuracy))}%` }}/><b>{formatMonthLabel(row.month).slice(0,3)}</b></span>)}</div><div className="accuracy-list">{rows.slice().reverse().map((row)=><div key={`row-${row.month}`}><span>{formatMonthLabel(row.month)}</span><strong>{Math.round(row.accuracy)}%</strong><small>{row.error >= 0 ? '+' : ''}{formatMoney(row.error)} difference</small></div>)}</div></div> : <p className="panel-empty-copy">Once the next real month is uploaded, FinSim compares the prior forecast with actual spending and shows the error here.</p>}</article>
}

function RecurringPanel({ snapshot }: { snapshot: AnalyticsSnapshot }) {
  const items = recurringItems(snapshot)
  return <article className="panel insight-mini-panel recurring-panel"><div className="panel-head"><div><span className="overline">RECURRING MONEY</span><h2>Bills and subscriptions</h2></div><span className="confidence"><ReceiptText size={14}/> {items.length} found</span></div><div className="recurring-list panel-scroll">{items.length ? items.map((item)=><div key={`${item.merchant}-${item.category}`}><span><strong>{item.merchant}</strong><small>{item.category} · {item.cadence}</small></span><b>{formatMoney(item.average)}</b></div>) : <p className="panel-empty-copy">No repeating merchants are visible yet. More months will improve subscription and bill detection.</p>}</div></article>
}

function BudgetTargetsPanel({ snapshot, rows }: { snapshot: AnalyticsSnapshot; rows: ReturnType<typeof monthCategoryRows> }) {
  const key = budgetTargetKey(snapshot)
  const [version, setVersion] = useState(0)
  const targets = useMemo(() => {
    void version
    return loadBudgetTargets(key)
  }, [key, version])
  function targetFor(row: ReturnType<typeof monthCategoryRows>[number]) {
    return Math.round(targets[row.name] ?? Math.max(Number(row.amount.replace(/[$,]/g, '')) * 1.1, 100))
  }
  function updateTarget(category: string, value: number) {
    const safeValue = Number.isFinite(value) ? Math.max(0, Math.min(999999, Math.round(value))) : 0
    const next = { ...targets, [category]: safeValue }
    saveBudgetTargets(key, next)
    setVersion((current) => current + 1)
  }
  return <article className="panel budget-panel"><div className="panel-head"><div><span className="overline">BUDGET TARGETS</span><h2>Set category limits</h2></div><span className="confidence"><Target size={14}/> editable</span></div><div className="budget-list panel-scroll">{rows.map((row)=>{const spent=Number(row.amount.replace(/[$,]/g,''));const target=targetFor(row);const percent=target ? Math.min(140,(spent/target)*100) : 0;return <div className="budget-row" key={row.name}><div><span><i style={{background:row.color}}/>{row.name}</span><label><b>$</b><input type="number" min={0} max={999999} step={1} inputMode="numeric" value={target} onChange={(event)=>updateTarget(row.name, Number(event.target.value))} onBlur={(event)=>updateTarget(row.name, Number(event.target.value))} aria-label={`${row.name} monthly budget target`}/></label></div><div className="progress"><i style={{width:`${Math.min(100,percent)}%`,background:percent>100?'#e11d48':row.color}}/></div><small>{formatMoney(spent)} spent of {formatMoney(target)} {percent>100?'· over target':'· on watch'}</small></div>})}</div></article>
}

function Dashboard() {
  return <Navigate to="/statements" replace />
}

function Analytics() {
  const snapshot = useAnalyticsSnapshot()
  const [anomalyDialogOpen, setAnomalyDialogOpen] = useState(false)
  const [insightDialogOpen, setInsightDialogOpen] = useState(false)
  const [chartMetric, setChartMetric] = useState<ChartMetric>('spending')
  const [chartWindow, setChartWindow] = useState(6)
  const [anomalyReviewVersion, setAnomalyReviewVersion] = useState(0)
  const anomalyKey = anomalyReviewKey(snapshot)
  const reviewedAnomalies = useMemo(() => {
    void anomalyReviewVersion
    return loadReviewedAnomalies(anomalyKey)
  }, [anomalyKey, anomalyReviewVersion])
  const openAnomalies = snapshot.analytics.anomaly_candidates.filter((item) => !reviewedAnomalies.includes(item.transaction_id))
  function clearAnomaly(transactionId: string) {
    saveReviewedAnomalies(anomalyKey, [...reviewedAnomalies, transactionId])
    setAnomalyReviewVersion((current) => current + 1)
  }
  function clearAllAnomalies() {
    saveReviewedAnomalies(anomalyKey, snapshot.analytics.anomaly_candidates.map((item) => item.transaction_id))
    setAnomalyReviewVersion((current) => current + 1)
  }
  if (!hasFinancialData(snapshot) && snapshot.source !== 'sample') {
    return <>
      <PageHeader eyebrow="DETAILED ANALYSIS" title="No analysis yet."/>
      <EmptyWorkspace title="Your analytics will appear after statement processing." message="Upload at least three monthly statements. Consecutive months are preferred, and once processing finishes this page will show comparisons, category mix, trends and anomaly candidates." />
    </>
  }
  const current = latestMonth(snapshot)
  const rows = monthCategoryRows(snapshot)
  const trend = topTrend(snapshot)
  const largest = rows[0] || categories[0]
  const spendTransactionCount = latestCategories(snapshot).reduce((sum, row) => sum + Number(row.transaction_count || 0), 0)
  const averagePurchase = Number(current.spending) / Math.max(1, spendTransactionCount || current.transaction_count)
  const anomalyCount = openAnomalies.length
  const recent = transactionPreview(snapshot)
  const patterns = insightPatterns(snapshot, rows, trend, anomalyCount)
  const chartData = monthlySeries(snapshot, chartMetric, chartWindow)
  return <><PageHeader eyebrow="DETAILED ANALYSIS" title="The story behind your spending."><button className="button button-secondary button-compact analysis-period-badge">{analysisPeriodLabel(snapshot)} <ChevronRight size={15}/></button></PageHeader>
    <div className="analytics-callout"><span><Sparkles/></span><div><strong>{trend ? `${trend.category} moved ${formatMoney(trend.change_amount)} ${trend.direction === 'up' ? 'up' : trend.direction === 'down' ? 'down' : 'flat'}.` : 'Your latest analytics are ready.'}</strong><p>{snapshot.source === 'saved-account' ? 'This insight is built from saved transactions in your FinSim account.' : snapshot.source === 'local-processing' ? 'This insight is built from your latest local statement processing run.' : 'This is sample data until you process real statements.'}</p></div><button type="button" onClick={() => setInsightDialogOpen(true)}>Explore insight <ArrowRight/></button></div>
    <div className="metric-grid three"><MetricCard label="AVG PURCHASE" value={formatMoney(averagePurchase)} detail="average outgoing transaction" icon={Gauge}/><MetricCard label="LARGEST CATEGORY" value={largest.amount} detail={`${largest.name} · ${largest.value.toFixed(0)}%`} icon={Landmark}/><MetricCard label="ANOMALIES" value={anomalyCount ? String(anomalyCount) : '0'} detail={anomalyCount ? 'open transaction review' : 'No anomalies, all verified'} icon={ReceiptText} onClick={() => setAnomalyDialogOpen(true)}/></div>
    <div className="dashboard-grid analytics-grid"><article className="panel chart-panel"><div className="panel-head chart-panel-head"><div><span className="overline">MONTHLY COMPARISON</span><h2>{chartMetricLabels[chartMetric]} trajectory</h2></div><div className="chart-controls"><div className="segmented-control" aria-label="Chart metric">{(Object.keys(chartMetricLabels) as ChartMetric[]).map((metric)=><button key={metric} type="button" className={metric === chartMetric ? 'active' : ''} onClick={() => setChartMetric(metric)}>{chartMetricLabels[metric]}</button>)}</div><select value={chartWindow} onChange={(event)=>setChartWindow(Number(event.target.value))} aria-label="Chart period"><option value={3}>Last 3 months</option><option value={6}>Last 6 months</option><option value={12}>Last 12 months</option></select></div></div><SpendingChart key={`${chartMetric}-${chartWindow}-${chartData.map((point) => point.month).join('-')}`} series={chartData} metric={chartMetric}/></article><article className="panel category-detail"><div className="panel-head"><div><span className="overline">CATEGORY MIX</span><h2>{formatMoney(current.spending)} total</h2></div><span className="category-count">{rows.length} groups</span></div>{rows.map(c=><div className="category-row" key={c.name}><div><span><i style={{background:c.color}}/>{c.name}</span><strong>{c.amount}</strong></div><div className="progress"><i style={{width:`${Math.max(2, Math.min(100, c.value))}%`,background:c.color}}/></div><small>{c.value.toFixed(1)}%</small></div>)}</article></div>
    <div className="insight-ops-grid"><ForecastAccuracyPanel snapshot={snapshot}/><RecurringPanel snapshot={snapshot}/><BudgetTargetsPanel snapshot={snapshot} rows={rows}/></div>
    <article className="panel insight-patterns" id="anomalies"><div className="panel-head"><div><span className="overline">PATTERNS WE FOUND</span><h2>Financial signals, not just alerts</h2></div><span className="confidence"><Sparkles size={14}/> {sourceLabel(snapshot)}</span></div><div className="pattern-grid">{patterns.map(({ title, body, signal, icon: Icon, tone })=><div className="pattern-card" key={title}><span className={`pattern-icon ${tone}`}><Icon/></span><strong>{title}</strong><p>{body}</p><small>{signal}</small></div>)}</div></article>
    <article className="panel transaction-panel"><div className="panel-head"><div><span className="overline">RECENT ACTIVITY</span><h2>Transactions behind the insights</h2></div><Link to="/statements">Upload more <ArrowRight size={14}/></Link></div><div className="transaction-list">{recent.map(t=><div className="transaction" key={`${t.merchant}-${t.date}-${t.amount}`}><span className={`merchant-icon ${t.tone}`}>{t.icon}</span><div><strong>{t.merchant}</strong><small>{t.category} · {t.date}</small></div><strong className={t.amount.startsWith('+')?'positive':''}>{t.amount}</strong></div>)}</div></article>
    {insightDialogOpen && <InsightDialog snapshot={snapshot} trend={trend} onClose={() => setInsightDialogOpen(false)} />}
    {anomalyDialogOpen && <AnomalyDialog items={openAnomalies} onClose={() => setAnomalyDialogOpen(false)} onClear={clearAnomaly} onClearAll={clearAllAnomalies} />}
  </>
}

function Forecast() {
  const snapshot = useAnalyticsSnapshot()
  const forecast = estimateNextMonth(snapshot)
  const current = latestMonth(snapshot)
  const forecastRows = monthCategoryRows(snapshot)
  const baselineDining = Number(forecastRows.find((row) => row.name.toLowerCase().includes('dining'))?.amount.replace(/[$,]/g, '') || 340)
  const baselineShopping = Number(forecastRows.find((row) => row.name.toLowerCase().includes('shopping'))?.amount.replace(/[$,]/g, '') || 390)
  const [dining, setDining] = useState(Math.round(baselineDining || 340))
  const [shopping, setShopping] = useState(Math.round(baselineShopping || 390))
  const [income, setIncome] = useState(Math.max(3000, Math.round(Number(current.income) || 4200)))
  if (!hasFinancialData(snapshot) && snapshot.source !== 'sample') {
    return <>
      <PageHeader eyebrow="FORECAST" title="Forecast needs history."/>
      <EmptyWorkspace title="Upload statements to unlock next month ranges." message="FinSim needs at least three monthly statements before it can build a useful forecast and scenario simulator. Consecutive months improve the result." />
    </>
  }
  const forecastExpected = forecast.expected
  const forecastLow = forecast.low
  const forecastHigh = forecast.high
  const predicted = Math.max(0, Math.round(forecastExpected - baselineDining - baselineShopping + dining + shopping))
  const adjustedLow = Math.max(0, forecastLow + predicted - forecastExpected)
  const adjustedHigh = forecastHigh + predicted - forecastExpected
  const savings = income - predicted
  const savingsRateDenominator = Math.max(1, income)
  const projectedSavingsRate = Math.round(Math.max(0, Math.min(80, (savings / savingsRateDenominator) * 100)))
  const incomeMax = Math.max(7000, income, Math.ceil(Number(current.income || 0) * 1.5))
  const diningMax = Math.max(1000, dining, Math.ceil(baselineDining * 2))
  const shoppingMax = Math.max(1200, shopping, Math.ceil(baselineShopping * 2))
  return <><PageHeader eyebrow={`${formatMonthLabel(forecast.targetMonth).toUpperCase()} OUTLOOK`} title="Shape your next month."><span className="confidence"><Sparkles size={14}/> {forecast.confidence} confidence</span></PageHeader>
    <div className="forecast-hero panel"><div><span className="overline">NEXT MONTH SPENDING RANGE</span><strong>{formatMoney(adjustedLow)} to {formatMoney(adjustedHigh)}</strong><p>Most likely after your assumptions: <b>{formatMoney(predicted)}</b></p></div><div className="forecast-health"><span>{projectedSavingsRate}%</span><div><strong>Projected savings rate</strong><small>{savings >= 0 ? `${formatMoney(savings)} left after spending` : `${formatMoney(Math.abs(savings))} above expected income`}</small></div></div></div>
    <div className="forecast-layout"><article className="panel simulator"><div className="panel-head"><div><span className="overline">SCENARIO SIMULATOR</span><h2>Adjust next month</h2></div><button onClick={()=>{setDining(Math.round(baselineDining || 340));setShopping(Math.round(baselineShopping || 390));setIncome(Math.max(3000, Math.round(Number(current.income) || 4200)))}}>Reset</button></div><p>Use the sliders or type exact dollar values to see how income and flexible spending affect only the next month estimate.</p><ForecastSlider label="Expected income" value={income} min={0} max={incomeMax} setValue={setIncome}/><ForecastSlider label="Dining & takeout" value={dining} min={0} max={diningMax} setValue={setDining}/><ForecastSlider label="Shopping" value={shopping} min={0} max={shoppingMax} setValue={setShopping}/><div className="sim-impact"><span><Sparkles/></span><div><small>SIMULATED IMPACT</small><strong>{savings > 1200 ? 'You have room to accelerate savings.' : savings >= 0 ? 'This plan stays above water.' : 'This plan would run above income.'}</strong></div></div></article><article className="panel forecast-breakdown"><div className="panel-head"><div><span className="overline">EXPECTED BREAKDOWN</span><h2>Likely drivers</h2></div></div>{forecastRows.slice(0,5).map((row)=><div className="forecast-row" key={row.name}><div><span>{row.name}</span><strong>{row.amount}</strong></div><div><i style={{width:`${Math.min(100, row.value)}%`}}/></div></div>)}<div className="model-note"><BrainCircuit/><div><strong>{forecast.method}</strong><p>{snapshot.source === 'sample' ? 'Upload statements to replace this example with your own next month estimate.' : 'This next month forecast uses your monthly spending history, recent trend and recent volatility.'}</p></div></div></article></div>
  </>
}

function ForecastSlider({label,value,min,max,setValue}:{label:string;value:number;min:number;max:number;setValue:(n:number)=>void}) {
  function update(nextValue: number) {
    setValue(Math.max(min, Math.min(max, Math.round(nextValue || 0))))
  }
  return <div className="forecast-slider"><div className="forecast-slider-head"><strong>{label}</strong><label><span>$</span><input type="number" min={min} max={max} value={value} onChange={event=>update(Number(event.target.value))} aria-label={`${label} dollar amount`}/></label></div><input type="range" min={min} max={max} value={value} onChange={event=>update(Number(event.target.value))}/><small><span>${min.toLocaleString()}</span><span>${max.toLocaleString()}</span></small></div>
}

function Statements() {
  return <StatementProcessingWorkspace />
}

function SettingsPage({ theme, setTheme }: { theme: Theme; setTheme: (theme: Theme) => void }) {
  const navigate = useNavigate()
  const [user, setUser] = useState(getStoredUser)
  const [fullName, setFullName] = useState(user?.full_name || '')
  const [emails, setEmails] = useState(user?.monthly_email ?? true)
  const [weeklyDigest, setWeeklyDigest] = useState(true)
  const [spendingAlerts, setSpendingAlerts] = useState(true)
  const [largeChargeAlerts, setLargeChargeAlerts] = useState(true)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const initials = (user?.full_name || user?.email || 'M').slice(0, 1).toUpperCase()

  useEffect(() => onSessionChange(() => {
    const nextUser = getStoredUser()
    setUser(nextUser)
    setFullName(nextUser?.full_name || '')
    setEmails(nextUser?.monthly_email ?? true)
  }), [])

  async function saveProfile() {
    setSaving(true)
    setMessage('')
    setError('')
    const cleanedName = fullName.trim().replace(/\s+/g, ' ')
    if (!cleanedName || cleanedName.length < 2 || cleanedName.length > 80) {
      setSaving(false)
      setError('Enter a full name between 2 and 80 characters.')
      return
    }
    try {
      const response = await updateAccountSettings({ full_name: cleanedName, theme, monthly_email: emails })
      setUser(response.user)
      setFullName(response.user.full_name)
      setMessage('Settings saved. Your workspace preferences are up to date.')
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Settings could not be saved.')
    } finally {
      setSaving(false)
    }
  }

  async function signOutFromSettings() {
    await signout().catch(() => undefined)
    navigate('/signin')
  }

  function clearInsights() {
    clearCachedAnalytics()
    setMessage('Local cached insights were cleared. Upload statements again to rebuild them.')
  }

  return <><PageHeader eyebrow="ACCOUNT" title="Settings."/><div className="settings-content settings-full">
    {message && <div className="auth-status">{message}</div>}
    {error && <div className="auth-error" role="alert">{error}</div>}
    <section className="panel settings-section"><div className="panel-head"><div><span className="overline">PROFILE</span><h2>Personal information</h2></div><button className="button button-secondary button-compact" onClick={() => setFullName(user?.full_name || '')}>Reset</button></div><div className="profile-row"><span className="profile-avatar">{initials}</span><div><strong>{user?.full_name || 'Local account'}</strong><small>{user?.email || 'Sign in to save account preferences'}</small></div><span className="confidence"><User size={14}/>{user ? 'Signed in' : 'Local preview'}</span></div><div className="form-grid"><label>Full name<input value={fullName} onChange={(event)=>setFullName(event.target.value)} placeholder="Your name" minLength={2} maxLength={80} autoComplete="name"/></label><label>Email address<input type="email" value={user?.email || ''} placeholder="you@example.com" autoComplete="email" disabled/></label><label>Home currency<select defaultValue="USD"><option>USD, US Dollar</option><option>CAD, Canadian Dollar</option></select></label><label>Time zone<select defaultValue="CT"><option value="CT">Central Time (US)</option><option>Eastern Time (US)</option><option>Pacific Time (US)</option></select></label></div><button className="button button-primary button-compact" disabled={saving || !user} onClick={saveProfile}>{saving ? 'Saving...' : 'Save profile'}</button></section>
    <section className="panel settings-section"><div><span className="overline">PREFERENCES</span><h2>Alerts and appearance</h2></div><div className="setting-row"><div><strong>Monthly insights email</strong><small>A summary when a new report is ready.</small></div><button className={emails?'switch on':'switch'} onClick={()=>setEmails(!emails)} aria-label="Toggle monthly email"><i/></button></div><div className="setting-row"><div><strong>Weekly digest</strong><small>Helpful spending highlights without opening the app.</small></div><button className={weeklyDigest?'switch on':'switch'} onClick={()=>setWeeklyDigest(!weeklyDigest)} aria-label="Toggle weekly digest"><i/></button></div><div className="setting-row"><div><strong>Spending spike alerts</strong><small>Flag a category when it moves sharply from your normal pattern.</small></div><button className={spendingAlerts?'switch on':'switch'} onClick={()=>setSpendingAlerts(!spendingAlerts)} aria-label="Toggle spending alerts"><i/></button></div><div className="setting-row"><div><strong>Large charge alerts</strong><small>Surface unusually large transactions in Analytics.</small></div><button className={largeChargeAlerts?'switch on':'switch'} onClick={()=>setLargeChargeAlerts(!largeChargeAlerts)} aria-label="Toggle large charge alerts"><i/></button></div><div className="setting-row"><div><strong>Appearance</strong><small>Choose how FinSim looks for you.</small></div><div className="theme-toggle"><button className={theme==='light'?'active':''} onClick={()=>setTheme('light')}><Sun/>Light</button><button className={theme==='dark'?'active':''} onClick={()=>setTheme('dark')}><Moon/>Dark</button></div></div><button className="button button-primary button-compact" disabled={saving || !user} onClick={saveProfile}>{saving ? 'Saving...' : 'Save preferences'}</button></section>
    <section className="panel settings-section"><div><span className="overline">PRIVACY</span><h2>Account and data controls</h2></div><div className="setting-row"><div><strong>Email verification</strong><small>{user?.email_verified ? 'Your account email is verified.' : 'Verify your email before processing statements.'}</small></div><span className="confidence"><ShieldCheck size={14}/>{user?.email_verified ? 'Verified' : 'Needs verification'}</span></div><div className="setting-row"><div><strong>Statement uploads</strong><small>Add PDFs or reprocess corrected files from the upload workspace.</small></div><Link className="button button-primary button-compact" to="/statements">Open upload workspace</Link></div><div className="setting-row"><div><strong>Cached insights</strong><small>Clear the local analytics snapshot stored in this browser.</small></div><button className="button button-secondary button-compact" onClick={clearInsights}>Clear local cache</button></div><div className="setting-row"><div><strong>Session</strong><small>Sign out if this is a shared computer.</small></div><button className="button button-secondary button-compact" onClick={signOutFromSettings}>Sign out</button></div><p className="settings-note">FinSim does not ask for bank credentials. Public deployment should keep uploaded files in private storage with short retention and database access limited to the app service account.</p></section>
  </div></>
}

function AuthPage({ kind }: { kind: 'signin' | 'signup' }) {
  const isSignup = kind === 'signup'
  const navigate = useNavigate()
  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [verificationToken, setVerificationToken] = useState('')
  const [statusMessage, setStatusMessage] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const cleanedName = fullName.trim().replace(/\s+/g, ' ')
    const cleanedEmail = email.trim().toLowerCase()
    if (isSignup && (cleanedName.length < 2 || cleanedName.length > 80)) {
      setError('Enter a full name between 2 and 80 characters.')
      return
    }
    if (!isValidEmail(cleanedEmail)) {
      setError('Enter a valid email address.')
      return
    }
    if (password.length < 8 || password.length > 128) {
      setError('Password must be between 8 and 128 characters.')
      return
    }
    setLoading(true)
    setError('')
    setStatusMessage('')
    try {
      if (isSignup) {
        setFullName(cleanedName)
        setEmail(cleanedEmail)
        const result = await signup(cleanedName, cleanedEmail, password)
        setVerificationToken(result.verification_token)
        setStatusMessage('Account created. Use the local verification token below to verify the email.')
      } else {
        setEmail(cleanedEmail)
        await signin(cleanedEmail, password)
        navigate('/statements')
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'The account request could not be completed.')
    } finally {
      setLoading(false)
    }
  }

  async function verifyAndContinue() {
    const cleanedEmail = email.trim().toLowerCase()
    const cleanedToken = verificationToken.trim()
    if (!cleanedToken) {
      setError('Enter the verification token.')
      return
    }
    setLoading(true)
    setError('')
    try {
      setVerificationToken(cleanedToken)
      await verifyEmail(cleanedToken)
      await signin(cleanedEmail, password)
      navigate('/statements')
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Email verification could not be completed.')
    } finally {
      setLoading(false)
    }
  }

  return <div className="auth-page"><div className="auth-brand"><Logo/><div><span className="overline">FINANCE, SIMPLIFIED</span><h1>Turn statements<br/>into confidence.</h1><p>Understand where your money goes, what looks unusual and what next month might hold.</p></div><small>© 2026 FinSim.</small></div><main className="auth-form-wrap"><Link to="/" className="auth-back">← Back home</Link><form className="auth-form" onSubmit={submit} noValidate><span className="mobile-auth-logo"><Logo/></span><span className="overline">{isSignup?'CREATE YOUR WORKSPACE':'WELCOME BACK'}</span><h2>{isSignup?'Start with a clean workspace.':'Good to see you.'}</h2><p>{isSignup?'Create an account, verify it, then upload your first three statements.':'Sign in with your verified account.'}</p>{isSignup&&<label>Full name<input value={fullName} onChange={(event)=>setFullName(event.target.value)} placeholder="Your name" minLength={2} maxLength={80} autoComplete="name" required/></label>}<label>Email address<input type="email" value={email} onChange={(event)=>setEmail(event.target.value)} placeholder="you@example.com" maxLength={254} autoComplete="email" inputMode="email" required/></label><label>Password<div className="password-input"><input type="password" value={password} onChange={(event)=>setPassword(event.target.value)} placeholder={isSignup?'At least 8 characters':'Your password'} minLength={8} maxLength={128} autoComplete={isSignup ? 'new-password' : 'current-password'} required/><LockKeyhole/></div></label>{!isSignup&&<div className="forgot"><label><input type="checkbox"/> Remember me</label><a href="#" onClick={(event)=>event.preventDefault()} aria-disabled="true">Forgot password?</a></div>}{statusMessage&&<div className="auth-status">{statusMessage}</div>}{verificationToken&&<label>Local verification token<input value={verificationToken} onChange={(event)=>setVerificationToken(event.target.value)} maxLength={160} autoComplete="one-time-code" /></label>}{error&&<div className="auth-error" role="alert">{error}</div>}{verificationToken?<button className="button button-primary auth-submit" type="button" disabled={loading} onClick={verifyAndContinue}>{loading?'Working...':'Verify email and upload statements'} <ArrowRight/></button>:<button className="button button-primary auth-submit" type="submit" disabled={loading}>{loading?'Working...':isSignup?'Create account':'Sign in'} <ArrowRight/></button>}<small className="auth-switch">{isSignup?'Already have an account?':'Need an account?'} <Link to={isSignup?'/signin':'/signup'}>{isSignup?'Sign in':'Sign up'}</Link></small>{isSignup&&<small className="terms">New accounts start empty. Insights appear after statement processing.</small>}</form></main></div>
}

function NotFound(){return <div className="not-found"><Logo/><span>404</span><h1>That page wandered off.</h1><p>Your finances are still exactly where you left them.</p><Link className="button button-primary" to="/">Back home</Link></div>}

export default function App() {
  // Theme changes are applied immediately so every page keeps the same look.
  const [theme, setTheme] = useState<Theme>(() => (localStorage.getItem('finsim-theme') as Theme) || 'light')
  useEffect(() => { document.documentElement.dataset.theme = theme; localStorage.setItem('finsim-theme', theme) }, [theme])
  // Keeping the account pages in one route list ensures that every one
  // receives the same navigation shell and responsive behavior.
  const appRoutes = useMemo(() => [
    { path: '/dashboard', element: <Dashboard/> },
    { path: '/analytics', element: <Analytics/> },
    { path: '/forecast', element: <Forecast/> },
    { path: '/statements', element: <Statements/> },
    { path: '/settings', element: <SettingsPage theme={theme} setTheme={setTheme}/> },
  ], [theme])
  return <Routes><Route path="/" element={<Landing theme={theme} setTheme={setTheme}/>}/><Route path="/signin" element={<AuthPage kind="signin"/>}/><Route path="/signup" element={<AuthPage kind="signup"/>}/>{appRoutes.map(r=><Route key={r.path} path={r.path} element={<AppShell theme={theme} setTheme={setTheme}>{r.element}</AppShell>}/>) }<Route path="*" element={<NotFound/>}/></Routes>
}
