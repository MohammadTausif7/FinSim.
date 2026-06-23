import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import {
  AlertTriangle,
  ArrowRight,
  Check,
  ChevronLeft,
  FileCheck2,
  FileText,
  LoaderCircle,
  LockKeyhole,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  Upload,
  X,
} from 'lucide-react'
import {
  allCategories,
  formatFileSize,
  maximumStatementBytes,
  minimumStatementCount,
  processingStages,
  sampleReviewItems,
  sampleStatements,
  type JobState,
  type ReviewItem,
  type StatementFile,
} from './processingJob'

function toStatementFiles(files: File[]) {
  return files.map((file, index): StatementFile => ({
    id: `${file.name}-${file.lastModified}-${index}`,
    name: file.name,
    size: file.size,
    periodLabel: `Statement ${index + 1}`,
  }))
}

export default function StatementProcessingWorkspace() {
  const inputRef = useRef<HTMLInputElement>(null)
  const [files, setFiles] = useState<StatementFile[]>([])
  const [jobState, setJobState] = useState<JobState>('idle')
  const [stageIndex, setStageIndex] = useState(0)
  const [error, setError] = useState('')
  const [reviewItems, setReviewItems] = useState<ReviewItem[]>(sampleReviewItems)
  const [activeReview, setActiveReview] = useState(0)
  const [reviewOpen, setReviewOpen] = useState(false)
  const [rememberMerchant, setRememberMerchant] = useState(true)

  const unresolved = useMemo(
    () => reviewItems.filter((item) => !item.resolvedCategory),
    [reviewItems],
  )
  const resolvedCount = reviewItems.length - unresolved.length
  const currentReview = unresolved[activeReview] || unresolved[0]

  useEffect(() => {
    if (jobState !== 'processing') return
    const timer = window.setTimeout(() => {
      if (stageIndex < processingStages.length - 1) {
        setStageIndex((current) => current + 1)
        return
      }
      setJobState('review')
      setActiveReview(0)
      setReviewOpen(true)
    }, 720)
    return () => window.clearTimeout(timer)
  }, [jobState, stageIndex])

  useEffect(() => {
    if (jobState !== 'finalizing') return
    const timer = window.setTimeout(() => setJobState('complete'), 900)
    return () => window.clearTimeout(timer)
  }, [jobState])

  useEffect(() => {
    if (!reviewOpen) return
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setReviewOpen(false)
    }
    document.addEventListener('keydown', closeOnEscape)
    return () => document.removeEventListener('keydown', closeOnEscape)
  }, [reviewOpen])

  function selectFiles(selected: File[]) {
    const pdfs = selected.filter((file) => file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf'))
    if (pdfs.length !== selected.length) {
      setError('Only PDF statements can be added to this workflow.')
      return
    }
    if (pdfs.some((file) => file.size > maximumStatementBytes)) {
      setError('Each statement must be 25 MB or smaller.')
      return
    }
    setFiles(toStatementFiles(pdfs.slice(0, 12)))
    setError('')
    setJobState('idle')
  }

  function startProcessing() {
    if (files.length < minimumStatementCount) {
      setError(`Add at least ${minimumStatementCount} monthly statements to build the first financial picture.`)
      return
    }
    setReviewItems(sampleReviewItems)
    setStageIndex(0)
    setError('')
    setJobState('processing')
  }

  function resolveReview(category: string) {
    if (!currentReview) return
    const currentId = currentReview.id
    const remainingAfterDecision = unresolved.length - 1
    setReviewItems((items) => items.map((item) => (
      item.id === currentId
        ? { ...item, resolvedCategory: category, rememberMerchant }
        : item
    )))
    setRememberMerchant(true)
    setActiveReview(0)
    if (remainingAfterDecision === 0) {
      setReviewOpen(false)
      setJobState('finalizing')
    }
  }

  function resetWorkspace() {
    if (inputRef.current) inputRef.current.value = ''
    setFiles([])
    setReviewItems(sampleReviewItems)
    setStageIndex(0)
    setError('')
    setReviewOpen(false)
    setJobState('idle')
  }

  const progress = jobState === 'complete'
    ? 100
    : jobState === 'review' || jobState === 'finalizing'
      ? 92
      : jobState === 'processing'
        ? processingStages[stageIndex].progress
        : 0

  return <>
    <div className="page-header statement-page-header">
      <div><span className="page-eyebrow">DATA WORKSPACE</span><h1>Turn statements into answers.</h1></div>
      {files.length > 0 && <button className="button button-secondary button-compact" onClick={resetWorkspace}><RefreshCw size={15}/> Start over</button>}
    </div>

    <section className="statement-workspace-grid">
      <article className="panel upload-workspace">
        <div className="workspace-heading">
          <span className="workspace-icon"><Upload /></span>
          <div><span className="overline">MONTHLY STATEMENTS</span><h2>Add at least three consecutive months</h2><p>The statement periods are confirmed after parsing. Files remain in this browser preview and are not transmitted.</p></div>
        </div>

        <input
          ref={inputRef}
          className="visually-hidden"
          type="file"
          accept="application/pdf,.pdf"
          multiple
          onChange={(event) => selectFiles(Array.from(event.target.files || []))}
        />

        {files.length === 0 ? <div className="statement-dropzone">
          <FileText />
          <strong>Select monthly statement PDFs</strong>
          <span>Three files minimum for a first financial picture</span>
          <div>
            <button className="button button-primary" onClick={() => inputRef.current?.click()}>Choose PDFs</button>
            <button className="button button-secondary" onClick={() => { setFiles(sampleStatements); setError('') }}>Use safe sample files</button>
          </div>
        </div> : <div className="selected-statements">
          <div className="selected-summary"><strong>{files.length} statements selected</strong><button onClick={() => inputRef.current?.click()}>Replace files</button></div>
          {files.map((file, index) => <div className="selected-file" key={file.id}>
            <span><FileCheck2 /></span>
            <div><strong>{file.name}</strong><small>{file.periodLabel} · {formatFileSize(file.size)}</small></div>
            <i>{index + 1}</i>
          </div>)}
          <button className="button button-primary process-button" disabled={jobState !== 'idle'} onClick={startProcessing}>
            {jobState === 'idle' && <>Process statements <ArrowRight /></>}
            {jobState === 'complete' && <>Processing complete <Check /></>}
            {jobState !== 'idle' && jobState !== 'complete' && <>Processing <LoaderCircle className="spin" /></>}
          </button>
        </div>}

        {error && <div className="statement-error" role="alert"><AlertTriangle />{error}</div>}
      </article>

      <article className="panel processing-status" aria-live="polite">
        <div className="processing-ring" style={{ '--job-progress': `${progress}%` } as CSSProperties}>
          <div><strong>{progress}%</strong><span>{jobState === 'idle' ? 'Ready' : jobState === 'complete' ? 'Complete' : 'In progress'}</span></div>
        </div>
        <div className="processing-copy">
          <span className="overline">PROCESSING JOB</span>
          <h2>{jobState === 'idle' && 'Waiting for statements'}{jobState === 'processing' && processingStages[stageIndex].label}{jobState === 'review' && `${unresolved.length} ${unresolved.length === 1 ? 'transaction needs' : 'transactions need'} your help`}{jobState === 'finalizing' && 'Applying your choices'}{jobState === 'complete' && 'Your financial picture is ready'}</h2>
          <p>{jobState === 'idle' && 'Choose files to preview the connected parsing and categorization flow.'}{jobState === 'processing' && processingStages[stageIndex].detail}{jobState === 'review' && 'FinSim paused before using uncertain categories in your analytics.'}{jobState === 'finalizing' && 'Category totals and quality checks are being refreshed.'}{jobState === 'complete' && 'Every uncertain sample transaction has a confirmed category.'}</p>
          {jobState === 'review' && <button className="button button-primary button-compact" onClick={() => setReviewOpen(true)}>Review transactions <ArrowRight /></button>}
          {jobState === 'complete' && <div className="completion-summary"><span><Check /> 103 cleaned</span><span><Check /> 3 user confirmed</span><span><ShieldCheck /> Quality checks passed</span></div>}
        </div>
      </article>
    </section>

    <section className="panel job-stage-panel">
      <div className="panel-head"><div><span className="overline">LIVE PIPELINE</span><h2>From PDFs to categorized data</h2></div><span className="integration-badge">Frontend integration preview</span></div>
      <div className="job-stages">{processingStages.map((stage, index) => {
        const done = jobState === 'review' || jobState === 'finalizing' || jobState === 'complete' || (jobState === 'processing' && index < stageIndex)
        const active = jobState === 'processing' && index === stageIndex
        return <div className={active ? 'job-stage active' : done ? 'job-stage done' : 'job-stage'} key={stage.id}>
          <span>{done ? <Check /> : active ? <LoaderCircle className="spin" /> : index + 1}</span>
          <div><strong>{stage.label}</strong><small>{stage.detail}</small></div>
        </div>
      })}</div>
    </section>

    <div className="privacy-note panel"><LockKeyhole/><div><strong>Private by design.</strong><p>This commit demonstrates the complete interaction using safe browser state. The processing API can replace the local job controller without changing the review experience.</p></div></div>

    {reviewOpen && currentReview && <div className="review-backdrop" role="presentation">
      <section className="review-dialog" role="dialog" aria-modal="true" aria-labelledby="review-title">
        <div className="review-dialog-head">
          <div><span className="overline">NEEDS YOUR INPUT</span><h2 id="review-title">What was this transaction for?</h2></div>
          <button autoFocus onClick={() => setReviewOpen(false)} aria-label="Review later"><X /></button>
        </div>
        <div className="review-progress"><div><i style={{ width: `${(resolvedCount / reviewItems.length) * 100}%` }}/></div><span>{resolvedCount} of {reviewItems.length} reviewed</span></div>
        <div className="review-transaction">
          <span>{currentReview.merchant.slice(0, 2).toUpperCase()}</span>
          <div><strong>{currentReview.merchant}</strong><small>{currentReview.description}</small><em>{currentReview.postedAt}</em></div>
          <b>{currentReview.amount}</b>
        </div>
        <div className="confidence-warning"><Sparkles/><div><strong>Low confidence: {currentReview.confidence}%</strong><p>No bank category or strong merchant rule matched this description.</p></div></div>
        <fieldset className="category-choices">
          <legend>Choose the best category</legend>
          <div>{currentReview.suggestions.map((category) => <button key={category} onClick={() => resolveReview(category)}>{category}<ArrowRight /></button>)}</div>
          <select aria-label="Choose another category" defaultValue="" onChange={(event) => event.target.value && resolveReview(event.target.value)}>
            <option value="" disabled>Choose another category</option>
            {allCategories.filter((category) => !currentReview.suggestions.includes(category)).map((category) => <option key={category}>{category}</option>)}
          </select>
        </fieldset>
        <label className="remember-choice"><input type="checkbox" checked={rememberMerchant} onChange={(event) => setRememberMerchant(event.target.checked)}/><span><strong>Remember this merchant</strong><small>Use the same category for future matching transactions.</small></span></label>
        <div className="review-dialog-foot"><button onClick={() => setReviewOpen(false)}><ChevronLeft /> Review later</button><span>Your choice is stored only in this preview.</span></div>
      </section>
    </div>}
  </>
}
