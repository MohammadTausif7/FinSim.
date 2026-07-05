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

const chartMetricLabels: Record<ChartMetric, string> = {
  spending: 'Spending',
  income: 'Income',
  net_cash_flow: 'Net cash flow',
}

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

function monthlySeries(snapshot: AnalyticsSnapshot, metric: ChartMetric, limit: number) {
  const summaries = snapshot.analytics.monthly_summaries.length
    ? snapshot.analytics.monthly_summaries
    : sampleAnalyticsSnapshot.analytics.monthly_summaries
  return summaries.slice(-limit).map((row) => ({
    month: row.month,
    label: formatMonthLabel(row.month).slice(0, 3).toUpperCase(),
    value: Number(row[metric] || 0),
  }))
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

function insightPatterns(snapshot: AnalyticsSnapshot, rows: ReturnType<typeof monthCategoryRows>, trend: ReturnType<typeof topTrend>) {
  const current = latestMonth(snapshot)
  const topCategory = rows[0]
  const netCashFlow = Number(current.net_cash_flow)
  const income = Math.max(Number(current.income), 1)
  const savingsRate = Math.round((netCashFlow / income) * 100)
  const anomalyCount = snapshot.analytics.anomaly_candidates.length
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

function AnomalyDialog({ items, onClose }: { items: AnomalyCandidate[]; onClose: () => void }) {
  const rows = items.length ? items : []
  return (
    <div className="review-backdrop" role="presentation">
      <section className="review-dialog insight-dialog" role="dialog" aria-modal="true" aria-labelledby="anomaly-dialog-title">
        <div className="review-dialog-head">
          <div><span className="overline">ANOMALY CANDIDATES</span><h2 id="anomaly-dialog-title">Transactions worth checking</h2></div>
          <button autoFocus onClick={onClose} aria-label="Close anomaly details"><X /></button>
        </div>
        <p className="dialog-intro">These are not automatically wrong. FinSim is surfacing charges that are large, unusual, recurring or category uncertain so you can review them quickly.</p>
        <div className="dialog-list">
          {rows.length ? rows.map((item) => <div className="dialog-row" key={item.transaction_id}>
            <span className={`severity-dot ${item.severity}`}/>
            <div><strong>{item.merchant}</strong><small>{item.reason} · {item.category} · {item.posted_at ? formatMonthLabel(item.posted_at.slice(0, 7)) : 'Latest data'}</small></div>
            <b>{formatMoney(item.amount)}</b>
          </div>) : <div className="dialog-row"><span className="severity-dot low"/><div><strong>No unusual activity found</strong><small>FinSim did not find anomaly candidates in this data set.</small></div><b>$0</b></div>}
        </div>
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
            <article><span className="step-number">01</span><div className="step-icon"><Upload /></div><h3>Drop in your statements</h3><p>Start with at least three consecutive monthly PDF statements so FinSim can build a first financial picture.</p><span className="micro-chip"><FileText size={13} /> statement.pdf <Check size={13} /></span></article>
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
        <div className="side-card"><span><Sparkles size={14} /></span><strong>FinSim insight</strong><p>{user ? 'Your saved account analytics refresh after each completed upload.' : 'Sign in to save processing results to your workspace.'}</p><Link to="/forecast">See forecast <ArrowRight size={13}/></Link></div>
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

function SpendingChart({ forecast = false, series, metric = 'spending' }: { forecast?: boolean; series?: ReturnType<typeof monthlySeries>; metric?: ChartMetric }) {
  const data = series?.length ? series : monthlySeries(sampleAnalyticsSnapshot, metric, 6)
  const [activeIndex, setActiveIndex] = useState(Math.max(0, data.length - 1))
  const width = 780
  const height = 260
  const left = 22
  const right = 24
  const top = 30
  const bottom = 214
  const values = data.map((point) => point.value)
  const min = metric === 'net_cash_flow' ? Math.min(0, ...values) : Math.min(...values)
  const max = Math.max(...values, metric === 'net_cash_flow' ? 0 : 1)
  const range = max - min || 1
  const points = data.map((point, index) => ({
    ...point,
    x: data.length === 1 ? width / 2 : left + (index * (width - left - right)) / (data.length - 1),
    y: top + ((max - point.value) / range) * (bottom - top),
  }))
  const linePath = smoothPath(points)
  const areaPath = `${linePath} L${points.at(-1)?.x || width} ${bottom} L${points[0]?.x || left} ${bottom} Z`
  const active = points[Math.min(activeIndex, points.length - 1)]
  const previous = points[Math.max(0, activeIndex - 1)]
  const delta = active && previous ? active.value - previous.value : 0
  return <div className="spending-chart interactive-chart"><div className="chart-readout"><span>{active?.label || 'NOW'}</span><strong>{formatMoney(active?.value || 0)}</strong><small className={delta >= 0 ? 'up' : 'down'}>{activeIndex > 0 ? `${delta >= 0 ? '+' : ''}${formatMoney(delta)} from previous point` : chartMetricLabels[metric]}</small></div><svg viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" role="img" aria-label={`${chartMetricLabels[metric]} trend chart`}><defs><linearGradient id={`chartFill-${metric}`} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="var(--accent)" stopOpacity=".25"/><stop offset="1" stopColor="var(--accent)" stopOpacity="0"/></linearGradient></defs><path className="chart-grid" d="M22 38H756M22 92H756M22 146H756M22 200H756"/><path className="chart-area" d={areaPath} fill={`url(#chartFill-${metric})`}/><path className="chart-line" d={linePath}/>{forecast && points.at(-1) && <path className="forecast-line" d={`M${points.at(-1)!.x} ${points.at(-1)!.y} C700 75 740 96 780 62`}/>} {points.map((point, index) => <circle key={point.month} cx={point.x} cy={point.y} r={index === activeIndex ? 7 : 4} onMouseEnter={() => setActiveIndex(index)} onFocus={() => setActiveIndex(index)} tabIndex={0} aria-label={`${point.label}: ${formatMoney(point.value)}`}/>)}</svg><div className="chart-labels">{data.map((point)=><span key={point.month}>{point.label}</span>)}</div></div>
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
  if (!hasFinancialData(snapshot) && snapshot.source !== 'sample') {
    return <>
      <PageHeader eyebrow="DETAILED ANALYSIS" title="No analysis yet."/>
      <EmptyWorkspace title="Your analytics will appear after statement processing." message="Upload at least three consecutive monthly statements. Once processing finishes, this page will show monthly comparisons, category mix, spending trends and anomaly candidates." />
    </>
  }
  const current = latestMonth(snapshot)
  const rows = monthCategoryRows(snapshot)
  const trend = topTrend(snapshot)
  const largest = rows[0] || categories[0]
  const dailySpend = Number(current.spending) / Math.max(1, current.transaction_count)
  const anomalyCount = snapshot.analytics.anomaly_candidates.length
  const recent = transactionPreview(snapshot)
  const patterns = insightPatterns(snapshot, rows, trend)
  const chartData = monthlySeries(snapshot, chartMetric, chartWindow)
  return <><PageHeader eyebrow="DETAILED ANALYSIS" title="The story behind your spending."><button className="button button-secondary button-compact">{formatMonthLabel(current.month)} <ChevronRight size={15}/></button></PageHeader>
    <div className="analytics-callout"><span><Sparkles/></span><div><strong>{trend ? `${trend.category} moved ${formatMoney(trend.change_amount)} ${trend.direction === 'up' ? 'up' : trend.direction === 'down' ? 'down' : 'flat'}.` : 'Your latest analytics are ready.'}</strong><p>{snapshot.source === 'saved-account' ? 'This insight is built from saved transactions in your FinSim account.' : snapshot.source === 'local-processing' ? 'This insight is built from your latest local statement processing run.' : 'This is sample data until you process real statements.'}</p></div><button type="button" onClick={() => setInsightDialogOpen(true)}>Explore insight <ArrowRight/></button></div>
    <div className="metric-grid three"><MetricCard label="AVERAGE ROW SPEND" value={formatMoney(dailySpend)} detail="monthly spend divided by rows" icon={Gauge}/><MetricCard label="LARGEST CATEGORY" value={largest.amount} detail={`${largest.name} · ${largest.value.toFixed(0)}%`} icon={Landmark}/><MetricCard label="ANOMALY CANDIDATES" value={String(anomalyCount)} detail="open transaction review" icon={ReceiptText} onClick={() => setAnomalyDialogOpen(true)}/></div>
    <div className="dashboard-grid analytics-grid"><article className="panel chart-panel"><div className="panel-head chart-panel-head"><div><span className="overline">MONTHLY COMPARISON</span><h2>{chartMetricLabels[chartMetric]} trajectory</h2></div><div className="chart-controls"><div className="segmented-control" aria-label="Chart metric">{(Object.keys(chartMetricLabels) as ChartMetric[]).map((metric)=><button key={metric} type="button" className={metric === chartMetric ? 'active' : ''} onClick={() => setChartMetric(metric)}>{chartMetricLabels[metric]}</button>)}</div><select value={chartWindow} onChange={(event)=>setChartWindow(Number(event.target.value))} aria-label="Chart period"><option value={3}>Last 3 months</option><option value={6}>Last 6 months</option><option value={12}>Last 12 months</option></select></div></div><SpendingChart series={chartData} metric={chartMetric}/></article><article className="panel category-detail"><div className="panel-head"><div><span className="overline">CATEGORY MIX</span><h2>{formatMoney(current.spending)} total</h2></div><span className="category-count">{rows.length} groups</span></div>{rows.map(c=><div className="category-row" key={c.name}><div><span><i style={{background:c.color}}/>{c.name}</span><strong>{c.amount}</strong></div><div className="progress"><i style={{width:`${Math.max(2, Math.min(100, c.value))}%`,background:c.color}}/></div><small>{c.value.toFixed(1)}%</small></div>)}</article></div>
    <article className="panel insight-patterns" id="anomalies"><div className="panel-head"><div><span className="overline">PATTERNS WE FOUND</span><h2>Financial signals, not just alerts</h2></div><span className="confidence"><Sparkles size={14}/> {sourceLabel(snapshot)}</span></div><div className="pattern-grid">{patterns.map(({ title, body, signal, icon: Icon, tone })=><div className="pattern-card" key={title}><span className={`pattern-icon ${tone}`}><Icon/></span><strong>{title}</strong><p>{body}</p><small>{signal}</small></div>)}</div></article>
    <article className="panel transaction-panel"><div className="panel-head"><div><span className="overline">RECENT ACTIVITY</span><h2>Transactions behind the insights</h2></div><Link to="/statements">Upload more <ArrowRight size={14}/></Link></div><div className="transaction-list">{recent.map(t=><div className="transaction" key={`${t.merchant}-${t.date}-${t.amount}`}><span className={`merchant-icon ${t.tone}`}>{t.icon}</span><div><strong>{t.merchant}</strong><small>{t.category} · {t.date}</small></div><strong className={t.amount.startsWith('+')?'positive':''}>{t.amount}</strong></div>)}</div></article>
    {insightDialogOpen && <InsightDialog snapshot={snapshot} trend={trend} onClose={() => setInsightDialogOpen(false)} />}
    {anomalyDialogOpen && <AnomalyDialog items={snapshot.analytics.anomaly_candidates} onClose={() => setAnomalyDialogOpen(false)} />}
  </>
}

function Forecast() {
  const snapshot = useAnalyticsSnapshot()
  const forecast = snapshot.analytics.forecast
  const current = latestMonth(snapshot)
  const [dining, setDining] = useState(340)
  const [shopping, setShopping] = useState(390)
  const [income, setIncome] = useState(Math.max(3000, Math.round(Number(current.income) || 4200)))
  if (!hasFinancialData(snapshot) && snapshot.source !== 'sample') {
    return <>
      <PageHeader eyebrow="FORECAST" title="Forecast needs history."/>
      <EmptyWorkspace title="Upload statements to unlock next month ranges." message="FinSim needs at least three consecutive months before it can build a useful forecast and scenario simulator." />
    </>
  }
  const forecastExpected = Number(forecast?.expected_spending || current.spending || 2260)
  const forecastLow = Number(forecast?.low || forecastExpected - 180)
  const forecastHigh = Number(forecast?.high || forecastExpected + 220)
  const predicted = Math.round(forecastExpected + dining * .12 + shopping * .1 - 90)
  const savings = income - predicted
  return <><PageHeader eyebrow={`${formatMonthLabel(forecast?.target_month || '2026-07').toUpperCase()} OUTLOOK`} title="Shape your next month."><span className="confidence"><Sparkles size={14}/> {forecast?.confidence || 'medium'} confidence</span></PageHeader>
    <div className="forecast-hero panel"><div><span className="overline">PREDICTED SPENDING</span><strong>{formatMoney(forecastLow)} to {formatMoney(forecastHigh)}</strong><p>Most likely: <b>{formatMoney(forecastExpected)}</b></p></div><div className="forecast-health"><span>{Math.round(Math.max(20,Math.min(95,savings/income*200)))}%</span><div><strong>Projected savings rate</strong><small>{formatMoney(savings)} left after spending</small></div></div></div>
    <div className="forecast-layout"><article className="panel simulator"><div className="panel-head"><div><span className="overline">SCENARIO SIMULATOR</span><h2>Adjust your assumptions</h2></div><button onClick={()=>{setDining(340);setShopping(390);setIncome(Math.max(3000, Math.round(Number(current.income) || 4200)))}}>Reset</button></div><p>Move the sliders to see how everyday choices change your forecast.</p><ForecastSlider label="Expected income" value={income} min={3000} max={7000} setValue={setIncome}/><ForecastSlider label="Dining & takeout" value={dining} min={100} max={800} setValue={setDining}/><ForecastSlider label="Shopping" value={shopping} min={100} max={1000} setValue={setShopping}/><div className="sim-impact"><span><Sparkles/></span><div><small>SIMULATED IMPACT</small><strong>{savings > 1200 ? 'You have room to accelerate savings.' : 'A small trim keeps your plan on track.'}</strong></div></div></article><article className="panel forecast-breakdown"><div className="panel-head"><div><span className="overline">EXPECTED BREAKDOWN</span><h2>Where it may go</h2></div></div>{monthCategoryRows(snapshot).slice(0,5).map((row)=><div className="forecast-row" key={row.name}><div><span>{row.name}</span><strong>{row.amount}</strong></div><div><i style={{width:`${Math.min(100, row.value)}%`}}/></div></div>)}<div className="model-note"><BrainCircuit/><div><strong>{forecast?.method || 'Baseline calculation'}</strong><p>{snapshot.source === 'sample' ? 'Upload statements to replace this example with your own forecast.' : 'This forecast is based on your processed statement history and adjustable assumptions.'}</p></div></div></article></div>
  </>
}

function ForecastSlider({label,value,min,max,setValue}:{label:string;value:number;min:number;max:number;setValue:(n:number)=>void}) {return <label className="forecast-slider"><span><strong>{label}</strong><b>${value.toLocaleString()}</b></span><input type="range" min={min} max={max} value={value} onChange={e=>setValue(Number(e.target.value))}/><small><span>${min.toLocaleString()}</span><span>${max.toLocaleString()}</span></small></label>}

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
    try {
      const response = await updateAccountSettings({ full_name: fullName, theme, monthly_email: emails })
      setUser(response.user)
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
    <section className="panel settings-section"><div className="panel-head"><div><span className="overline">PROFILE</span><h2>Personal information</h2></div><button className="button button-secondary button-compact" onClick={() => setFullName(user?.full_name || '')}>Reset</button></div><div className="profile-row"><span className="profile-avatar">{initials}</span><div><strong>{user?.full_name || 'Local account'}</strong><small>{user?.email || 'Sign in to save account preferences'}</small></div><span className="confidence"><User size={14}/>{user ? 'Signed in' : 'Local preview'}</span></div><div className="form-grid"><label>Full name<input value={fullName} onChange={(event)=>setFullName(event.target.value)} placeholder="Your name"/></label><label>Email address<input value={user?.email || ''} placeholder="you@example.com" disabled/></label><label>Home currency<select defaultValue="USD"><option>USD, US Dollar</option><option>CAD, Canadian Dollar</option></select></label><label>Time zone<select defaultValue="CT"><option value="CT">Central Time (US)</option><option>Eastern Time (US)</option><option>Pacific Time (US)</option></select></label></div><button className="button button-primary button-compact" disabled={saving || !user} onClick={saveProfile}>{saving ? 'Saving...' : 'Save profile'}</button></section>
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
    setLoading(true)
    setError('')
    setStatusMessage('')
    try {
      if (isSignup) {
        const result = await signup(fullName, email, password)
        setVerificationToken(result.verification_token)
        setStatusMessage('Account created. Use the local verification token below to verify the email.')
      } else {
        await signin(email, password)
        navigate('/statements')
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'The account request could not be completed.')
    } finally {
      setLoading(false)
    }
  }

  async function verifyAndContinue() {
    setLoading(true)
    setError('')
    try {
      await verifyEmail(verificationToken)
      await signin(email, password)
      navigate('/statements')
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Email verification could not be completed.')
    } finally {
      setLoading(false)
    }
  }

  return <div className="auth-page"><div className="auth-brand"><Logo/><div><span className="overline">FINANCE, SIMPLIFIED</span><h1>Turn statements<br/>into confidence.</h1><p>Understand where your money goes, what looks unusual and what next month might hold.</p></div><small>© 2026 FinSim.</small></div><main className="auth-form-wrap"><Link to="/" className="auth-back">← Back home</Link><form className="auth-form" onSubmit={submit}><span className="mobile-auth-logo"><Logo/></span><span className="overline">{isSignup?'CREATE YOUR WORKSPACE':'WELCOME BACK'}</span><h2>{isSignup?'Start with a clean workspace.':'Good to see you.'}</h2><p>{isSignup?'Create an account, verify it, then upload your first three statements.':'Sign in with your verified account.'}</p>{isSignup&&<label>Full name<input value={fullName} onChange={(event)=>setFullName(event.target.value)} placeholder="Your name" required/></label>}<label>Email address<input type="email" value={email} onChange={(event)=>setEmail(event.target.value)} placeholder="you@example.com" required/></label><label>Password<div className="password-input"><input type="password" value={password} onChange={(event)=>setPassword(event.target.value)} placeholder={isSignup?'At least 8 characters':'Your password'} minLength={8} required/><LockKeyhole/></div></label>{!isSignup&&<div className="forgot"><label><input type="checkbox"/> Remember me</label><a href="#">Forgot password?</a></div>}{statusMessage&&<div className="auth-status">{statusMessage}</div>}{verificationToken&&<label>Local verification token<input value={verificationToken} onChange={(event)=>setVerificationToken(event.target.value)} /></label>}{error&&<div className="auth-error" role="alert">{error}</div>}{verificationToken?<button className="button button-primary auth-submit" type="button" disabled={loading} onClick={verifyAndContinue}>{loading?'Working...':'Verify email and upload statements'} <ArrowRight/></button>:<button className="button button-primary auth-submit" type="submit" disabled={loading}>{loading?'Working...':isSignup?'Create account':'Sign in'} <ArrowRight/></button>}<small className="auth-switch">{isSignup?'Already have an account?':'Need an account?'} <Link to={isSignup?'/signin':'/signup'}>{isSignup?'Sign in':'Sign up'}</Link></small>{isSignup&&<small className="terms">New accounts start empty. Insights appear after statement processing.</small>}</form></main></div>
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
