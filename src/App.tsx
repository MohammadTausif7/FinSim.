import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react'
import { Link, NavLink, Route, Routes, useLocation, useNavigate } from 'react-router-dom'
import StatementProcessingWorkspace from './features/statements/StatementProcessingWorkspace'
import { getStoredUser, onSessionChange, signin, signout, signup, updateAccountSettings, verifyEmail } from './features/account/accountApi'
import {
  formatMoney,
  formatMonthLabel,
  latestCategories,
  latestMonth,
  previousMonth,
  recentTransactions,
  sourceLabel,
  topTrend,
  useAnalyticsSnapshot,
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
  CircleHelp,
  CreditCard,
  FileCheck2,
  FileText,
  Gauge,
  Landmark,
  LayoutDashboard,
  LockKeyhole,
  Menu,
  Moon,
  MoreHorizontal,
  PiggyBank,
  ReceiptText,
  Search,
  Settings,
  ShieldCheck,
  Sparkles,
  Sun,
  Target,
  TrendingUp,
  Upload,
  User,
  WalletCards,
  X,
  Zap,
} from 'lucide-react'

type Theme = 'light' | 'dark'

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

const categoryColors = ['#101418', '#2f72ff', '#8aaeff', '#b9ceff', '#e5ebf7', '#75a7ff']
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

function monthlyChange(current: string, previous: string) {
  const currentValue = Number(current)
  const previousValue = Number(previous)
  if (!previousValue) return '0%'
  return `${Math.abs(((currentValue - previousValue) / previousValue) * 100).toFixed(1)}%`
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
          <a href="/#security" onClick={() => setOpen(false)}>Security</a>
          <Link to="/dashboard" onClick={() => setOpen(false)}>Open app</Link>
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
          <span className="demo-search"><Search size={12} /> Search your finances</span>
          <span className="demo-avatar">FS</span>
        </div>
        <div className="demo-body">
          <aside className="demo-sidebar">
            <span className="active"><LayoutDashboard /> Overview</span>
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
            <article className="feature-large"><div className="feature-copy"><span className="feature-icon"><Gauge /></span><h3>One calm financial home</h3><p>Cash flow, spending, savings and recent activity are organized into a dashboard you can actually read.</p><Link to="/dashboard">Explore the dashboard <ArrowRight size={15} /></Link></div><div className="bento-ui"><div className="bento-balance"><small>AVAILABLE BALANCE</small><strong>$6,482.19</strong><span>Across 2 accounts</span></div><div className="ring"><div><strong>68%</strong><small>of monthly plan</small></div></div></div></article>
            <article><span className="feature-icon blue"><BrainCircuit /></span><h3>A forecast you can shape</h3><p>Adjust rent, groceries or goals and immediately see the range of likely outcomes.</p><div className="slider-mock"><span><i>Dining</i><b>$340</b></span><input type="range" value="62" readOnly /><span><i>Expected range</i><b>$2.3k to $2.7k</b></span></div></article>
            <article><span className="feature-icon amber"><Bell /></span><h3>Quietly watching for the unusual</h3><p>Duplicate charges, spending spikes and surprising subscriptions rise to the surface.</p><div className="alert-mock"><span>!</span><div><strong>Unusual charge</strong><small>$129.00 · Streaming</small></div><ChevronRight /></div></article>
            <article className="security-card" id="security"><span className="feature-icon green"><ShieldCheck /></span><h3>Privacy is part of the workflow</h3><p>FinSim uses account-scoped jobs, PDF checks, short-lived processing files and no bank credential access.</p><div className="security-points"><span><Check /> Authenticated uploads</span><span><Check /> No bank credentials</span><span><Check /> Private local data</span></div></article>
            <article className="statement-card"><span className="feature-icon violet"><ReceiptText /></span><h3>Flexible statement support</h3><p>Built for messy descriptions, changing formats and more than one bank.</p><div className="files-stack"><span>APR <FileCheck2 /></span><span>MAY <FileCheck2 /></span><span>JUN <FileCheck2 /></span></div></article>
          </div>
        </section>

        <section className="cta section-pad"><div className="cta-card"><span className="cta-orb"/><span className="overline">YOUR NEXT MONTH STARTS HERE</span><h2>Money feels lighter<br/>when it makes sense.</h2><p>Bring three statements. We'll bring the perspective.</p><Link className="button button-white" to="/signup">Build my financial picture <ArrowRight /></Link></div></section>
      </main>
      <footer><div className="footer-main"><Logo /><p>Finance, simplified.<br/>Decisions, clarified.</p><div><strong>Product</strong><a href="/#features">Features</a><Link to="/dashboard">Dashboard</Link><a href="/#security">Security</a></div><div><strong>Workflow</strong><a href="/#how-it-works">How it works</a><Link to="/statements">Upload statements</Link></div></div><div className="footer-bottom"><span>© 2026 FinSim.</span><span>Statement analytics workspace</span></div></footer>
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
    { to: '/dashboard', label: 'Overview', icon: LayoutDashboard },
    { to: '/analytics', label: 'Analytics', icon: BarChart3 },
    { to: '/forecast', label: 'Forecast', icon: BrainCircuit },
    { to: '/statements', label: 'Statements', icon: FileText },
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
          <a href="/#how-it-works"><CircleHelp size={18} />How it works</a>
        </nav>
        <div className="side-card"><span><Sparkles size={14} /></span><strong>FinSim insight</strong><p>{user ? 'Your saved account analytics refresh after each completed upload.' : 'Sign in to save processing results to your workspace.'}</p><Link to="/forecast">See forecast <ArrowRight size={13}/></Link></div>
        <div className="side-profile"><span>{initials}</span><div><strong>{user?.full_name || 'Guest'}</strong><small>{user ? 'Personal workspace' : 'Sample workspace'}</small></div>{user ? <button className="profile-action" onClick={handleSignout} type="button">Sign out</button> : <MoreHorizontal />}</div>
      </aside>
      <div className="app-main">
        <header className="app-topbar">
          <button className="mobile-menu app-menu" onClick={() => setMobileOpen(!mobileOpen)}><Menu /></button>
          <div className="breadcrumbs"><span>FinSim</span><ChevronRight size={13}/><strong>{location.pathname.slice(1) || 'Overview'}</strong><span className="demo-badge">{user ? 'Account workspace' : 'Example data'}</span></div>
          <div className="top-actions"><Link className="search-button" to="/analytics"><Search size={16}/><span>Search insights</span><kbd>⌘ K</kbd></Link><ThemeButton theme={theme} setTheme={setTheme}/><Link className="icon-button notification" to="/analytics#anomalies" aria-label="View anomaly candidates"><Bell size={18}/><i /></Link><Link className="avatar" to="/settings" aria-label="Open settings">{initials}</Link></div>
        </header>
        <main className="page-content">{children}</main>
      </div>
    </div>
  )
}

function PageHeader({ eyebrow, title, children }: { eyebrow: string; title: string; children?: ReactNode }) {
  return <div className="page-header"><div><span className="page-eyebrow">{eyebrow}</span><h1>{title}</h1></div>{children}</div>
}

function MetricCard({ label, value, detail, trend, down, icon: Icon, to }: { label: string; value: string; detail: string; trend?: string; down?: boolean; icon: typeof WalletCards; to?: string }) {
  const content = <><div className="metric-top"><span className="metric-icon"><Icon /></span><span className="metric-menu">{to ? <ArrowRight /> : <MoreHorizontal />}</span></div><span className="metric-label">{label}</span><strong>{value}</strong><div className={down ? 'metric-detail down' : 'metric-detail'}>{trend && <span>{down ? <ArrowDownRight/> : <ArrowUpRight/>}{trend}</span>}<small>{detail}</small></div></>
  return to ? <Link className="metric-card metric-card-link" to={to}>{content}</Link> : <article className="metric-card">{content}</article>
}

function SpendingChart({ forecast = false }: { forecast?: boolean }) {
  // An inline SVG keeps this prototype light. Once the analytics API is wired in,
  // these paths can be replaced by a chart component fed by real monthly values.
  return <div className="spending-chart"><svg viewBox="0 0 780 260" preserveAspectRatio="none" role="img" aria-label="Six month spending chart"><defs><linearGradient id="chartFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#2f72ff" stopOpacity=".17"/><stop offset="1" stopColor="#2f72ff" stopOpacity="0"/></linearGradient></defs><path className="chart-grid" d="M0 20H780M0 90H780M0 160H780M0 230H780"/><path className="chart-area" d="M0 200 C52 195 74 118 130 140 S207 203 260 134 S350 70 390 110 S475 188 520 113 S613 68 650 87 S726 72 780 44 L780 260 L0 260Z"/><path className="chart-line" d="M0 200 C52 195 74 118 130 140 S207 203 260 134 S350 70 390 110 S475 188 520 113 S613 68 650 87 S726 72 780 44"/>{forecast && <path className="forecast-line" d="M650 87 C700 75 740 96 780 62"/>}<circle cx="650" cy="87" r="5"/></svg><div className="chart-labels"><span>JAN</span><span>FEB</span><span>MAR</span><span>APR</span><span>MAY</span><span>JUN</span></div></div>
}

function Dashboard() {
  const snapshot = useAnalyticsSnapshot()
  if (!hasFinancialData(snapshot) && snapshot.source !== 'sample') {
    return <>
      <PageHeader eyebrow="GET STARTED" title="Your workspace is ready."><Link className="button button-primary button-compact" to="/statements"><Upload size={16}/> Add statements</Link></PageHeader>
      <EmptyWorkspace title="Upload statements to build your dashboard." message="A new account starts empty. Add at least three consecutive monthly statements and FinSim will create your cash flow, spending, categories, anomalies and forecast." />
      <div className="metric-grid"><MetricCard label="STATEMENTS" value="0" detail="upload three months to begin" icon={FileText} to="/statements"/><MetricCard label="TRANSACTIONS" value="0" detail="waiting for processed data" icon={ReceiptText} to="/statements"/><MetricCard label="ANALYTICS" value="Ready" detail="created after upload" icon={BarChart3} to="/analytics"/><MetricCard label="FORECAST" value="Pending" detail="needs statement history" icon={BrainCircuit} to="/forecast"/></div>
    </>
  }
  const current = latestMonth(snapshot)
  const previous = previousMonth(snapshot)
  const rows = monthCategoryRows(snapshot)
  const recent = transactionPreview(snapshot)
  const spendChange = monthlyChange(current.spending, previous.spending)
  const spendDown = Number(current.spending) <= Number(previous.spending)
  const savings = Number(current.income) - Number(current.spending)
  return <>
    <PageHeader eyebrow={sourceLabel(snapshot).toUpperCase()} title="Your money, in focus."><Link className="button button-primary button-compact" to="/statements"><Upload size={16}/> Add statements</Link></PageHeader>
    <div className="health-banner"><div className="health-score"><span>{Math.max(20, Math.min(95, Math.round((savings / Math.max(Number(current.income), 1)) * 100 + 45)))}</span></div><div><span className="overline">FINANCIAL HEALTH</span><strong>{savings >= 0 ? 'You are building steady momentum.' : 'Spending is running ahead of income.'}</strong><p>{snapshot.source === 'saved-account' ? `Based on ${snapshot.transactionCount} saved transactions in your account.` : snapshot.source === 'local-processing' ? `Based on ${snapshot.transactionCount} processed transactions from your latest upload.` : 'Upload statements to replace this example with your own analytics.'}</p></div><Link to="/analytics">View full analysis <ArrowRight size={15}/></Link></div>
    <div className="metric-grid"><MetricCard label="NET CASH FLOW" value={formatMoney(current.net_cash_flow)} detail={`for ${formatMonthLabel(current.month)}`} icon={WalletCards}/><MetricCard label="SPENT THIS MONTH" value={formatMoney(current.spending)} trend={spendChange} detail={spendDown ? 'less than previous month' : 'more than previous month'} down={spendDown} icon={CreditCard}/><MetricCard label="SMART SAVINGS" value={formatMoney(Math.max(savings, 0))} detail={savings >= 0 ? 'income left after spending' : 'negative cash flow'} icon={PiggyBank}/><MetricCard label="ANOMALIES" value={String(snapshot.analytics.anomaly_candidates.length)} detail="items worth checking" icon={ReceiptText} to="/analytics#anomalies"/></div>
    <div className="dashboard-grid"><article className="panel chart-panel"><div className="panel-head"><div><span className="overline">SPENDING PULSE</span><h2>{formatMoney(current.spending)} <small>{formatMonthLabel(current.month)}</small></h2></div><select aria-label="Chart period"><option>Last 3 months</option><option>Latest upload</option></select></div><SpendingChart/></article><article className="panel category-panel"><div className="panel-head"><div><span className="overline">WHERE IT WENT</span><h2>By category</h2></div><Link to="/analytics">Details <ArrowRight size={14}/></Link></div><div className="donut" style={{background: 'conic-gradient(#101418 0 38%, #2f72ff 38% 62%, #8aaeff 62% 78%, #b9ceff 78% 90%, #e5ebf7 90%)'}}><div><strong>{formatMoney(current.spending)}</strong><small>total</small></div></div><div className="category-list">{rows.slice(0,4).map((item)=><div key={item.name}><span><i style={{background:item.color}}/>{item.name}</span><strong>{item.amount}</strong></div>)}</div></article></div>
    <article className="panel transaction-panel"><div className="panel-head"><div><span className="overline">RECENT ACTIVITY</span><h2>Transactions</h2></div><Link to="/analytics">View all <ArrowRight size={14}/></Link></div><div className="transaction-list">{recent.map(t=><div className="transaction" key={`${t.merchant}-${t.date}-${t.amount}`}><span className={`merchant-icon ${t.tone}`}>{t.icon}</span><div><strong>{t.merchant}</strong><small>{t.category} · {t.date}</small></div><strong className={t.amount.startsWith('+')?'positive':''}>{t.amount}</strong></div>)}</div></article>
  </>
}

function Analytics() {
  const snapshot = useAnalyticsSnapshot()
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
  const patterns = snapshot.analytics.anomaly_candidates.length
    ? snapshot.analytics.anomaly_candidates.slice(0, 3)
    : [{ transaction_id: 'no-anomalies', posted_at: '', merchant: 'No unusual activity', category: 'Checks', amount: '0.00', reason: 'FinSim did not find obvious anomaly candidates in this run.', severity: 'low' as const }]
  return <><PageHeader eyebrow="DETAILED ANALYSIS" title="The story behind your spending."><button className="button button-secondary button-compact">{formatMonthLabel(current.month)} <ChevronRight size={15}/></button></PageHeader>
    <div className="analytics-callout"><span><Sparkles/></span><div><strong>{trend ? `${trend.category} moved ${formatMoney(trend.change_amount)} ${trend.direction === 'up' ? 'up' : trend.direction === 'down' ? 'down' : 'flat'}.` : 'Your latest analytics are ready.'}</strong><p>{snapshot.source === 'saved-account' ? 'This insight is built from saved transactions in your FinSim account.' : snapshot.source === 'local-processing' ? 'This insight is built from your latest local statement processing run.' : 'This is sample data until you process real statements.'}</p></div><button>Explore insight <ArrowRight/></button></div>
    <div className="metric-grid three"><MetricCard label="AVERAGE ROW SPEND" value={formatMoney(dailySpend)} detail="monthly spend divided by rows" icon={Gauge}/><MetricCard label="LARGEST CATEGORY" value={largest.amount} detail={`${largest.name} · ${largest.value.toFixed(0)}%`} icon={Landmark}/><MetricCard label="ANOMALY CANDIDATES" value={String(anomalyCount)} detail="open the transaction list below" icon={ReceiptText} to="#anomalies"/></div>
    <div className="dashboard-grid analytics-grid"><article className="panel chart-panel"><div className="panel-head"><div><span className="overline">MONTHLY COMPARISON</span><h2>Spending trajectory</h2></div><div className="legend"><span><i/>This month</span><span><i/>Previous month</span></div></div><SpendingChart/></article><article className="panel category-detail"><div className="panel-head"><div><span className="overline">CATEGORY MIX</span><h2>{formatMoney(current.spending)} total</h2></div></div>{rows.map(c=><div className="category-row" key={c.name}><div><span><i style={{background:c.color}}/>{c.name}</span><strong>{c.amount}</strong></div><div className="progress"><i style={{width:`${Math.min(100, c.value)}%`,background:c.color}}/></div><small>{c.value.toFixed(0)}%</small></div>)}</article></div>
    <article className="panel" id="anomalies"><div className="panel-head"><div><span className="overline">PATTERNS WE FOUND</span><h2>Worth your attention</h2></div></div><div className="pattern-grid">{patterns.map((item, index)=><div key={item.transaction_id}><span className={index === 0 ? 'pattern-icon warn' : 'pattern-icon blue'}>{index === 0 ? <Bell/> : <Target/>}</span><strong>{item.merchant}</strong><p>{item.reason} · {formatMoney(item.amount)} in {item.category}.</p><small>{item.posted_at ? formatMonthLabel(item.posted_at.slice(0, 7)) : 'Latest data'} · {item.severity || 'normal'} priority</small></div>)}</div></article>
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

type SettingsSection = 'profile' | 'notifications' | 'security' | 'data'

function SettingsPage({ theme, setTheme }: { theme: Theme; setTheme: (theme: Theme) => void }) {
  const navigate = useNavigate()
  const [user, setUser] = useState(getStoredUser)
  const [section, setSection] = useState<SettingsSection>('profile')
  const [fullName, setFullName] = useState(user?.full_name || '')
  const [emails, setEmails] = useState(user?.monthly_email ?? true)
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
      setMessage('Settings saved.')
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

  const navItems: Array<{ id: SettingsSection; label: string; icon: typeof User }> = [
    { id: 'profile', label: 'Profile', icon: User },
    { id: 'notifications', label: 'Notifications', icon: Bell },
    { id: 'security', label: 'Privacy & security', icon: ShieldCheck },
    { id: 'data', label: 'Data & statements', icon: Landmark },
  ]

  return <><PageHeader eyebrow="ACCOUNT" title="Settings."/><div className="settings-layout"><aside className="settings-nav">{navItems.map(({ id, label, icon: Icon }) => <button key={id} className={section === id ? 'active' : ''} onClick={() => setSection(id)}><Icon/>{label}</button>)}</aside><div className="settings-content">
    {message && <div className="auth-status">{message}</div>}
    {error && <div className="auth-error" role="alert">{error}</div>}
    {section === 'profile' && <section className="panel settings-section"><div className="panel-head"><div><span className="overline">PROFILE</span><h2>Personal information</h2></div></div><div className="profile-row"><span className="profile-avatar">{initials}</span><div><strong>{user?.full_name || 'Local account'}</strong><small>{user?.email || 'Sign in to save account preferences'}</small></div><button className="button button-secondary button-compact" onClick={() => setFullName(user?.full_name || '')}>Reset</button></div><div className="form-grid"><label>Full name<input value={fullName} onChange={(event)=>setFullName(event.target.value)} placeholder="Your name"/></label><label>Email address<input value={user?.email || ''} placeholder="you@example.com" disabled/></label><label>Home currency<select defaultValue="USD"><option>USD, US Dollar</option><option>CAD, Canadian Dollar</option></select></label><label>Time zone<select defaultValue="CT"><option value="CT">Central Time (US)</option><option>Eastern Time (US)</option></select></label></div><button className="button button-primary button-compact" disabled={saving || !user} onClick={saveProfile}>{saving ? 'Saving...' : 'Save changes'}</button></section>}
    {section === 'notifications' && <section className="panel settings-section"><div><span className="overline">NOTIFICATIONS</span><h2>Updates and reports</h2></div><div className="setting-row"><div><strong>Monthly insights email</strong><small>A summary when your report is ready. Production email delivery is configured during deployment.</small></div><button className={emails?'switch on':'switch'} onClick={()=>setEmails(!emails)} aria-label="Toggle monthly email"><i/></button></div><button className="button button-primary button-compact" disabled={saving || !user} onClick={saveProfile}>{saving ? 'Saving...' : 'Save notification settings'}</button></section>}
    {section === 'security' && <section className="panel settings-section"><div><span className="overline">PRIVACY & SECURITY</span><h2>Account protection</h2></div><div className="setting-row"><div><strong>Email verification</strong><small>{user?.email_verified ? 'Your local account is verified.' : 'Verify your email before processing statements.'}</small></div><span className="confidence"><ShieldCheck size={14}/>{user?.email_verified ? 'Verified' : 'Needs verification'}</span></div><div className="setting-row"><div><strong>Session</strong><small>Sign out if this is a shared computer.</small></div><button className="button button-secondary button-compact" onClick={signOutFromSettings}>Sign out</button></div></section>}
    {section === 'data' && <section className="panel settings-section"><div><span className="overline">DATA & STATEMENTS</span><h2>Your financial data</h2></div><div className="setting-row"><div><strong>Statement uploads</strong><small>Add new PDFs or reprocess a corrected set of statements.</small></div><Link className="button button-primary button-compact" to="/statements">Open upload workspace</Link></div><div className="setting-row"><div><strong>Saved analytics</strong><small>Dashboard, analytics and forecast pages refresh after successful processing.</small></div><Link className="button button-secondary button-compact" to="/analytics">View analytics</Link></div><p className="settings-note">Account deletion and raw file retention controls are listed in the deployment checklist before public release.</p></section>}
    <section className="panel settings-section"><div><span className="overline">APPEARANCE</span><h2>Theme</h2></div><div className="setting-row"><div><strong>Appearance</strong><small>Choose how FinSim looks for you.</small></div><div className="theme-toggle"><button className={theme==='light'?'active':''} onClick={()=>setTheme('light')}><Sun/>Light</button><button className={theme==='dark'?'active':''} onClick={()=>setTheme('dark')}><Moon/>Dark</button></div></div></section>
  </div></div></>
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
        navigate('/dashboard')
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

  return <div className="auth-page"><div className="auth-brand"><Logo/><div><span className="overline">FINANCE, SIMPLIFIED</span><h1>Turn statements<br/>into confidence.</h1><p>Understand where your money goes, what looks unusual and what next month might hold.</p></div><small>© 2026 FinSim.</small></div><main className="auth-form-wrap"><Link to="/" className="auth-back">← Back home</Link><form className="auth-form" onSubmit={submit}><span className="mobile-auth-logo"><Logo/></span><span className="overline">{isSignup?'CREATE YOUR WORKSPACE':'WELCOME BACK'}</span><h2>{isSignup?'Start with a clean workspace.':'Good to see you.'}</h2><p>{isSignup?'Create an account, verify it, then upload your first three statements.':'Sign in with your verified account.'}</p>{isSignup&&<label>Full name<input value={fullName} onChange={(event)=>setFullName(event.target.value)} placeholder="Your name" required/></label>}<label>Email address<input type="email" value={email} onChange={(event)=>setEmail(event.target.value)} placeholder="you@example.com" required/></label><label>Password<div className="password-input"><input type="password" value={password} onChange={(event)=>setPassword(event.target.value)} placeholder={isSignup?'At least 8 characters':'Your password'} minLength={8} required/><LockKeyhole/></div></label>{!isSignup&&<div className="forgot"><label><input type="checkbox"/> Remember me</label><a href="#">Forgot password?</a></div>}{statusMessage&&<div className="auth-status">{statusMessage}</div>}{verificationToken&&<label>Local verification token<input value={verificationToken} onChange={(event)=>setVerificationToken(event.target.value)} /></label>}{error&&<div className="auth-error" role="alert">{error}</div>}{verificationToken?<button className="button button-primary auth-submit" type="button" disabled={loading} onClick={verifyAndContinue}>{loading?'Working...':'Verify email and upload statements'} <ArrowRight/></button>:<button className="button button-primary auth-submit" type="submit" disabled={loading}>{loading?'Working...':isSignup?'Create account':'Sign in'} <ArrowRight/></button>}<small className="auth-switch">{isSignup?'Already have an account?':'Need an account?'} <Link to={isSignup?'/signin':'/signup'}>{isSignup?'Sign in':'Sign up'}</Link></small>{isSignup&&<small className="terms">New accounts start empty. Your dashboard appears after statement processing.</small>}</form></main></div>
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
