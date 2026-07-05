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
import {
  createProcessingJob,
  deleteProcessingJob,
  getProcessingJob,
  getProcessingResult,
  getReviewItems,
  submitFeedback,
  type ApiReviewItem,
} from './processingApi'
import { refreshSavedAccountAnalytics, saveProcessingResult } from '../analytics/analyticsSnapshot'
import { getSessionToken } from '../account/accountApi'

function toStatementFiles(files: File[]) {
  return files.map((file, index): StatementFile => ({
    id: `${file.name}-${file.lastModified}-${index}`,
    name: file.name,
    size: file.size,
    periodLabel: `Statement ${index + 1}`,
  }))
}

function toReviewItem(item: ApiReviewItem): ReviewItem {
  return {
    id: item.id,
    transactionIds: item.transaction_ids,
    occurrenceCount: item.occurrence_count,
    merchant: item.merchant,
    description: item.description,
    postedAt: new Date(`${item.posted_at}T00:00:00`).toLocaleDateString('en-US', {
      month: 'long',
      day: 'numeric',
      year: 'numeric',
    }),
    amount: `$${Number(item.amount).toLocaleString('en-US', { minimumFractionDigits: 2 })}`,
    confidence: item.confidence,
    suggestions: item.suggestions,
    reviewSummary: item.review_summary,
  }
}

export default function StatementProcessingWorkspace() {
  const inputRef = useRef<HTMLInputElement>(null)
  const jobIdRef = useRef<string | null>(null)
  const [files, setFiles] = useState<StatementFile[]>([])
  const [selectedFiles, setSelectedFiles] = useState<File[]>([])
  const [sampleMode, setSampleMode] = useState(false)
  const [jobId, setJobId] = useState<string | null>(null)
  const [jobState, setJobState] = useState<JobState>('idle')
  const [stageIndex, setStageIndex] = useState(0)
  const [error, setError] = useState('')
  const [reviewItems, setReviewItems] = useState<ReviewItem[]>(sampleReviewItems)
  const [activeReview, setActiveReview] = useState(0)
  const [reviewOpen, setReviewOpen] = useState(false)
  const [rememberMerchant, setRememberMerchant] = useState(true)
  const [availableCategories, setAvailableCategories] = useState(allCategories)
  const [completion, setCompletion] = useState({ cleaned: 0, confirmed: 0, warnings: 0 })

  const unresolved = useMemo(
    () => reviewItems.filter((item) => !item.resolvedCategory),
    [reviewItems],
  )
  const resolvedCount = reviewItems.length - unresolved.length
  const currentReview = unresolved[activeReview] || unresolved[0]

  useEffect(() => {
    jobIdRef.current = jobId
  }, [jobId])

  useEffect(() => () => {
    if (jobIdRef.current) void deleteProcessingJob(jobIdRef.current).catch(() => undefined)
  }, [])

  useEffect(() => {
    if (jobState !== 'processing' || !sampleMode) return
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
  }, [jobState, sampleMode, stageIndex])

  useEffect(() => {
    if (jobState !== 'processing' || sampleMode || !jobId) return
    let cancelled = false
    let timer = 0

    async function poll() {
      try {
        const job = await getProcessingJob(jobId as string)
        if (cancelled) return
        const nextStage = processingStages.findIndex((stage) => stage.id === job.stage)
        if (nextStage >= 0) setStageIndex(nextStage)
        if (job.status === 'error') {
          setError(job.error || 'The statement job could not be completed.')
          setJobState('idle')
          return
        }
        if (job.status === 'review') {
          const review = await getReviewItems(job.job_id)
          if (cancelled) return
          setReviewItems(review.items.map(toReviewItem))
          setAvailableCategories(review.categories)
          setActiveReview(0)
          setJobState('review')
          setReviewOpen(true)
          return
        }
        if (job.status === 'complete') {
          const result = await getProcessingResult(job.job_id)
          if (cancelled) return
          saveProcessingResult(result)
          void refreshSavedAccountAnalytics().catch(() => undefined)
          setCompletion({
            cleaned: result.quality_report.output_rows,
            confirmed: result.reviewed_merchant_count,
            warnings: result.quality_report.warnings.length,
          })
          setJobState('finalizing')
          return
        }
        timer = window.setTimeout(poll, 650)
      } catch (caught) {
        if (cancelled) return
        setError(caught instanceof Error ? caught.message : 'The processing service stopped responding.')
        setJobState('idle')
      }
    }

    void poll()
    return () => {
      cancelled = true
      window.clearTimeout(timer)
    }
  }, [jobId, jobState, sampleMode])

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
    if (pdfs.length > 12) {
      setError('Add no more than 12 monthly statements at one time.')
      return
    }
    if (jobId) void deleteProcessingJob(jobId).catch(() => undefined)
    setFiles(toStatementFiles(pdfs))
    setSelectedFiles(pdfs)
    setSampleMode(false)
    setJobId(null)
    setError('')
    setJobState('idle')
  }

  async function startProcessing() {
    if (files.length < minimumStatementCount) {
      setError(`Add at least ${minimumStatementCount} monthly statements to build the first financial picture.`)
      return
    }
    if (!sampleMode && !getSessionToken()) {
      setError('Sign in before processing statements so results can be saved to your account.')
      return
    }
    setReviewItems(sampleReviewItems)
    setStageIndex(0)
    setError('')
    setJobState('processing')
    if (sampleMode) return
    try {
      if (jobId) await deleteProcessingJob(jobId)
      const job = await createProcessingJob(selectedFiles)
      setJobId(job.job_id)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'The statements could not be uploaded.')
      setJobState('idle')
    }
  }

  async function resolveReview(category: string) {
    if (!currentReview) return
    const currentId = currentReview.id
    const remainingAfterDecision = unresolved.length - 1
    if (!sampleMode && jobId) {
      try {
        const job = await submitFeedback(jobId, [{
          transaction_ids: currentReview.transactionIds || [currentId],
          category,
          remember_merchant: rememberMerchant,
        }])
        if (remainingAfterDecision === 0 && job.status === 'complete') {
          const result = await getProcessingResult(jobId)
          saveProcessingResult(result)
          void refreshSavedAccountAnalytics().catch(() => undefined)
          setCompletion({
            cleaned: result.quality_report.output_rows,
            confirmed: result.reviewed_merchant_count,
            warnings: result.quality_report.warnings.length,
          })
        }
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : 'The category choice could not be saved.')
        setReviewOpen(false)
        return
      }
    }
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
    if (jobId) void deleteProcessingJob(jobId).catch(() => undefined)
    if (inputRef.current) inputRef.current.value = ''
    setFiles([])
    setSelectedFiles([])
    setSampleMode(false)
    setJobId(null)
    setReviewItems(sampleReviewItems)
    setStageIndex(0)
    setError('')
    setReviewOpen(false)
    setJobState('idle')
  }

  function useSafeSamples() {
    if (jobId) void deleteProcessingJob(jobId).catch(() => undefined)
    setFiles(sampleStatements)
    setSelectedFiles([])
    setSampleMode(true)
    setJobId(null)
    setError('')
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
          <div><span className="overline">MONTHLY STATEMENTS</span><h2>Add at least three consecutive months</h2><p>Statement periods are confirmed after parsing. Selected PDFs are sent only to the local FinSim processing service.</p></div>
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
            <button className="button button-secondary" onClick={useSafeSamples}>Use safe sample files</button>
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
          <h2>{jobState === 'idle' && 'Waiting for statements'}{jobState === 'processing' && processingStages[stageIndex].label}{jobState === 'review' && `${unresolved.length} ${unresolved.length === 1 ? 'transaction needs' : 'transactions need'} your help`}{jobState === 'finalizing' && 'Applying your choices'}{jobState === 'complete' && 'Your categorized data is ready'}</h2>
          <p>{jobState === 'idle' && 'Choose files to start the parsing and categorization flow.'}{jobState === 'processing' && processingStages[stageIndex].detail}{jobState === 'review' && 'FinSim paused before using uncertain categories in your analytics.'}{jobState === 'finalizing' && 'Category totals and quality checks are being refreshed.'}{jobState === 'complete' && (sampleMode ? 'Every uncertain sample transaction has a confirmed category.' : 'Analytics are ready on the dashboard, analysis and forecast pages.')}</p>
          {jobState === 'review' && <button className="button button-primary button-compact" onClick={() => setReviewOpen(true)}>Review merchants <ArrowRight /></button>}
          {jobState === 'complete' && <div className="completion-summary"><span><Check /> {sampleMode ? 103 : completion.cleaned} cleaned</span><span><Check /> {sampleMode ? 3 : completion.confirmed} merchants reviewed</span><span><ShieldCheck /> {completion.warnings ? `${completion.warnings} quality warnings` : 'Quality checks passed'}</span></div>}
          {jobState === 'complete' && !sampleMode && <a className="button button-primary button-compact analytics-ready-link" href="/analytics">View analytics <ArrowRight /></a>}
        </div>
      </article>
    </section>

    <section className="panel job-stage-panel">
      <div className="panel-head"><div><span className="overline">LIVE PIPELINE</span><h2>From PDFs to categorized data</h2></div><span className="integration-badge">{sampleMode ? 'Safe sample run' : jobId ? 'Local API connected' : 'Processing API ready'}</span></div>
      <div className="job-stages">{processingStages.map((stage, index) => {
        const done = jobState === 'review' || jobState === 'finalizing' || jobState === 'complete' || (jobState === 'processing' && index < stageIndex)
        const active = jobState === 'processing' && index === stageIndex
        return <div className={active ? 'job-stage active' : done ? 'job-stage done' : 'job-stage'} key={stage.id}>
          <span>{done ? <Check /> : active ? <LoaderCircle className="spin" /> : index + 1}</span>
          <div><strong>{stage.label}</strong><small>{stage.detail}</small></div>
        </div>
      })}</div>
    </section>

    <div className="privacy-note panel"><LockKeyhole/><div><strong>Private by design.</strong><p>{sampleMode || files.length === 0 ? 'Safe sample files stay in browser memory.' : 'The local processing service removes temporary PDF copies as soon as parsing finishes.'} Account data stays scoped to the signed-in user.</p></div></div>

    {reviewOpen && currentReview && <div className="review-backdrop" role="presentation">
      <section className="review-dialog" role="dialog" aria-modal="true" aria-labelledby="review-title">
        <div className="review-dialog-head">
          <div><span className="overline">NEEDS YOUR INPUT</span><h2 id="review-title">{(currentReview.occurrenceCount || 1) > 1 ? 'What were these transactions for?' : 'What was this transaction for?'}</h2></div>
          <button autoFocus onClick={() => setReviewOpen(false)} aria-label="Review later"><X /></button>
        </div>
        <div className="review-progress"><div><i style={{ width: `${(resolvedCount / reviewItems.length) * 100}%` }}/></div><span>{resolvedCount} of {reviewItems.length} reviewed</span></div>
        <div className="review-transaction">
          <span>{currentReview.merchant.slice(0, 2).toUpperCase()}</span>
          <div><strong>{currentReview.merchant}</strong><small>{(currentReview.occurrenceCount || 1) > 1 ? `${currentReview.occurrenceCount} matching transactions · ${currentReview.description}` : currentReview.description}</small><em>{currentReview.postedAt}</em></div>
          <b>{currentReview.amount}</b>
        </div>
        <div className="confidence-warning"><Sparkles/><div><strong>Low confidence: {currentReview.confidence}%</strong><p>{currentReview.reviewSummary || 'No bank category or strong merchant rule matched this description.'}</p></div></div>
        <fieldset className="category-choices">
          <legend>Choose the best category</legend>
          <div>{currentReview.suggestions.map((category) => <button key={category} onClick={() => resolveReview(category)}>{category}<ArrowRight /></button>)}</div>
          <select key={currentReview.id} aria-label="Choose another category" defaultValue="" onChange={(event) => event.target.value && resolveReview(event.target.value)}>
            <option value="" disabled>Choose another category</option>
            {availableCategories.filter((category) => !currentReview.suggestions.includes(category)).map((category) => <option key={category}>{category}</option>)}
          </select>
        </fieldset>
        <label className="remember-choice"><input type="checkbox" checked={rememberMerchant} onChange={(event) => setRememberMerchant(event.target.checked)}/><span><strong>Remember this merchant</strong><small>Use the same category for future matching transactions.</small></span></label>
        <div className="review-dialog-foot"><button onClick={() => setReviewOpen(false)}><ChevronLeft /> Review later</button><span>{sampleMode ? 'Your choice is stored only for this sample run.' : 'Your choice is saved with this account processing job.'}</span></div>
      </section>
    </div>}
  </>
}
