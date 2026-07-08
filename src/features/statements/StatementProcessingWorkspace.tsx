import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import {
  AlertTriangle,
  ArrowRight,
  Check,
  ChevronLeft,
  FileCheck2,
  FileText,
  LoaderCircle,
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
  type UploadMode,
} from './processingApi'
import { refreshSavedAccountAnalytics, saveProcessingResult } from '../analytics/analyticsSnapshot'
import { getSessionToken } from '../account/accountApi'

function toStatementFiles(files: File[], uploadModes: UploadMode[], detectedTypes: string[] = []) {
  return files.map((file, index): StatementFile => ({
    id: `${file.name}-${file.lastModified}-${index}`,
    name: file.name,
    size: file.size,
    periodLabel: `Statement ${index + 1}`,
    uploadMode: uploadModes[index] || 'multiple',
    detectedAccountType: detectedTypes[index],
  }))
}

function uploadModeLabel(mode: UploadMode) {
  if (mode === 'credit') return 'Added as credit card'
  if (mode === 'single') return 'Added as single bank'
  return 'Added as multiple accounts'
}

function detectedAccountLabel(accountType?: string) {
  if (!accountType) return ''
  return accountType.replace(/_/g, ' ')
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
  const [selectedFileHashes, setSelectedFileHashes] = useState<string[]>([])
  const [selectedFileIntents, setSelectedFileIntents] = useState<UploadMode[]>([])
  const [selectedFileDetectedTypes, setSelectedFileDetectedTypes] = useState<string[]>([])
  const [uploadDialogOpen, setUploadDialogOpen] = useState(false)
  const [uploadMode, setUploadMode] = useState<UploadMode>('multiple')
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
  const [completion, setCompletion] = useState({ cleaned: 0, confirmed: 0, warnings: 0, internalTransfers: 0 })

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
            internalTransfers: result.quality_report.internal_transfer_matches || 0,
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

  async function selectFiles(selected: File[]) {
    if (!selected.length) return
    const pdfs = selected.filter((file) => file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf'))
    if (pdfs.length !== selected.length) {
      setError('Only PDF statements can be added to this workflow.')
      if (inputRef.current) inputRef.current.value = ''
      return
    }
    if (pdfs.some((file) => file.size > maximumStatementBytes)) {
      setError('Each statement must be 25 MB or smaller.')
      if (inputRef.current) inputRef.current.value = ''
      return
    }
    let incoming: Array<{ file: File, hash: string }>
    try {
      incoming = await Promise.all(pdfs.map(async (file) => ({
        file,
        hash: await statementFileHash(file),
      })))
    } catch {
      setError('FinSim could not read one of the selected PDFs. Try choosing the file again.')
      if (inputRef.current) inputRef.current.value = ''
      return
    }
    const merged = [...selectedFiles]
    const mergedHashes = [...selectedFileHashes]
    const mergedIntents = [...selectedFileIntents]
    const mergedDetectedTypes = [...selectedFileDetectedTypes]
    for (const { file, hash } of incoming) {
      if (mergedHashes.includes(hash)) {
        setError(`${file.name} appears to be the same statement already selected, even if the file name is different.`)
        if (inputRef.current) inputRef.current.value = ''
        return
      }
      merged.push(file)
      mergedHashes.push(hash)
      mergedIntents.push(uploadMode)
      mergedDetectedTypes.push('')
    }
    if (merged.length > 12) {
      setError('Add no more than 12 monthly statements in one processing run.')
      if (inputRef.current) inputRef.current.value = ''
      return
    }
    if (jobId) void deleteProcessingJob(jobId).catch(() => undefined)
    setFiles(toStatementFiles(merged, mergedIntents, mergedDetectedTypes))
    setSelectedFiles(merged)
    setSelectedFileHashes(mergedHashes)
    setSelectedFileIntents(mergedIntents)
    setSelectedFileDetectedTypes(mergedDetectedTypes)
    setSampleMode(false)
    setJobId(null)
    setError('')
    setJobState('idle')
    if (inputRef.current) inputRef.current.value = ''
  }

  function chooseUploadMode(mode: UploadMode) {
    setUploadMode(mode)
    setUploadDialogOpen(false)
    window.setTimeout(() => inputRef.current?.click(), 0)
  }

  function removeSelectedFile(index: number) {
    if (jobState !== 'idle') return
    if (jobId) void deleteProcessingJob(jobId).catch(() => undefined)
    const nextFiles = selectedFiles.filter((_, fileIndex) => fileIndex !== index)
    const nextHashes = selectedFileHashes.filter((_, fileIndex) => fileIndex !== index)
    const nextIntents = selectedFileIntents.filter((_, fileIndex) => fileIndex !== index)
    const nextDetectedTypes = selectedFileDetectedTypes.filter((_, fileIndex) => fileIndex !== index)
    setSelectedFiles(nextFiles)
    setSelectedFileHashes(nextHashes)
    setSelectedFileIntents(nextIntents)
    setSelectedFileDetectedTypes(nextDetectedTypes)
    setFiles(toStatementFiles(nextFiles, nextIntents, nextDetectedTypes))
    setJobId(null)
    setSampleMode(false)
    setError('')
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
      const jobUploadMode = selectedFileIntents.every((intent) => intent === selectedFileIntents[0])
        ? selectedFileIntents[0] || uploadMode
        : 'multiple'
      const job = await createProcessingJob(selectedFiles, jobUploadMode, selectedFileIntents)
      const detectedTypes = job.statement_types.map((statement) => statement.account_type)
      setSelectedFileDetectedTypes(detectedTypes)
      setFiles(toStatementFiles(selectedFiles, selectedFileIntents, detectedTypes))
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
            internalTransfers: result.quality_report.internal_transfer_matches || 0,
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
    setSelectedFileHashes([])
    setSelectedFileIntents([])
    setSelectedFileDetectedTypes([])
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
    setSelectedFileHashes([])
    setSelectedFileIntents([])
    setSelectedFileDetectedTypes([])
    setUploadMode('multiple')
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
  const transactionReadingDone = jobState === 'review'
    || jobState === 'finalizing'
    || jobState === 'complete'
    || (jobState === 'processing' && stageIndex > 1)
  const transactionReadingActive = jobState === 'processing' && !transactionReadingDone
  const accountMatchingDone = jobState === 'review' || jobState === 'finalizing' || jobState === 'complete'
  const accountMatchingActive = jobState === 'processing' && stageIndex > 1
  const merchantReviewDone = jobState === 'finalizing' || jobState === 'complete'
  const selectedUploadSummary = selectedFileIntents.length
    ? selectedFileIntents.every((intent) => intent === selectedFileIntents[0])
      ? uploadModeLabel(selectedFileIntents[0])
      : 'Mixed statement types'
    : uploadModeLabel(uploadMode)

  return <>
    <div className="page-header statement-page-header">
      <div><span className="page-eyebrow">DATA WORKSPACE</span><h1>Turn statements into answers.</h1></div>
      {files.length > 0 && <button className="button button-secondary button-compact" onClick={resetWorkspace}><RefreshCw size={15}/> Start over</button>}
    </div>

    <section className="statement-workspace-grid">
      <article className="panel upload-workspace">
        <div className="workspace-heading">
          <span className="workspace-icon"><Upload /></span>
          <div><span className="overline">MONTHLY STATEMENTS</span><h2>Add at least three monthly statements</h2><p>Consecutive months are preferred for stronger trends and forecasts, but non-consecutive statements can still be processed.</p></div>
        </div>

        <input
          ref={inputRef}
          className="visually-hidden"
          type="file"
          accept="application/pdf,.pdf"
          multiple
          onChange={(event) => void selectFiles(Array.from(event.target.files || []))}
        />

        {files.length === 0 ? <div className="statement-dropzone">
          <FileText />
          <strong>Select monthly statement PDFs</strong>
          <span>Three monthly periods minimum. You can mix checking, savings and credit card statements.</span>
          <div>
            <button className="button button-primary" onClick={() => setUploadDialogOpen(true)}>Choose PDFs</button>
            <button className="button button-secondary" onClick={useSafeSamples}>Use safe sample files</button>
          </div>
        </div> : <div className="selected-statements">
          <div className="selected-summary"><strong>{files.length} statements selected</strong><span>{selectedUploadSummary}</span><button onClick={() => setUploadDialogOpen(true)}>Add more PDFs</button></div>
          {files.map((file, index) => <div className="selected-file" key={file.id}>
            <span><FileCheck2 /></span>
            <div>
              <strong>{file.name}</strong>
              <small>{file.periodLabel} · {formatFileSize(file.size)}</small>
              <div className="statement-file-tags">
                <b>{uploadModeLabel(file.uploadMode)}</b>
                {file.detectedAccountType && <b>Detected {detectedAccountLabel(file.detectedAccountType)}</b>}
              </div>
            </div>
            <i>{index + 1}</i>
            {jobState === 'idle' && <button className="remove-selected-file" type="button" onClick={() => removeSelectedFile(index)} aria-label={`Remove ${file.name}`}><X /></button>}
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
          <p>{jobState === 'idle' && 'Choose files to start building your spending picture.'}{jobState === 'processing' && processingStages[stageIndex].detail}{jobState === 'review' && 'FinSim found a few transactions where your input will improve the report.'}{jobState === 'finalizing' && 'Your report is being refreshed with the confirmed categories.'}{jobState === 'complete' && (sampleMode ? 'Every uncertain sample transaction has a confirmed category.' : 'Insights and forecast are ready to review.')}</p>
          {jobState === 'review' && <button className="button button-primary button-compact" onClick={() => setReviewOpen(true)}>Review merchants <ArrowRight /></button>}
          {jobState === 'complete' && <div className="completion-summary"><span><Check /> {sampleMode ? 103 : completion.cleaned} cleaned</span><span><Check /> {sampleMode ? 3 : completion.confirmed} merchants reviewed</span><span><Sparkles /> {sampleMode ? 0 : completion.internalTransfers} account transfers matched</span><span><ShieldCheck /> {completion.warnings ? `${completion.warnings} quality warnings` : 'Quality checks passed'}</span></div>}
          {jobState === 'complete' && !sampleMode && <a className="button button-primary button-compact analytics-ready-link" href="/analytics">View analytics <ArrowRight /></a>}
        </div>
      </article>
    </section>

    <section className="panel statement-guidance-panel">
      <div className="panel-head"><div><span className="overline">WHAT HAPPENS NEXT</span><h2>Your report is built in four clear checks</h2></div><span className="integration-badge">{files.length >= minimumStatementCount ? 'Ready to process' : `${minimumStatementCount - files.length} more needed`}</span></div>
      <div className="job-stages guidance-stages">
        <div className={files.length >= minimumStatementCount ? 'job-stage done' : 'job-stage'}><span>{files.length >= minimumStatementCount ? <Check /> : '1'}</span><div><strong>Statement coverage</strong><small>Use at least three months. Consecutive months are preferred for stronger forecast context.</small></div></div>
        <div className={transactionReadingDone ? 'job-stage done' : transactionReadingActive ? 'job-stage active' : 'job-stage'}><span>{transactionReadingDone ? <Check /> : transactionReadingActive ? <LoaderCircle className="spin" /> : '2'}</span><div><strong>Transaction reading</strong><small>FinSim extracts dates, descriptions, amounts and balances from each PDF.</small></div></div>
        <div className={accountMatchingDone ? 'job-stage done' : accountMatchingActive ? 'job-stage active' : 'job-stage'}><span>{accountMatchingDone ? <Check /> : accountMatchingActive ? <LoaderCircle className="spin" /> : '3'}</span><div><strong>Account matching</strong><small>Same-month payments and transfers across accounts are matched so they do not inflate spending.</small></div></div>
        <div className={merchantReviewDone ? 'job-stage done' : jobState === 'review' ? 'job-stage active' : 'job-stage'}><span>{merchantReviewDone ? <Check /> : jobState === 'review' ? <RefreshCw /> : '4'}</span><div><strong>Merchant review</strong><small>Only unclear merchants ask for your input, and repeated merchants are grouped.</small></div></div>
      </div>
      <p className="statement-privacy-copy"><ShieldCheck size={15}/> FinSim does not ask for bank credentials. Uploaded statements are used only to create your report.</p>
    </section>

    {uploadDialogOpen && <div className="review-backdrop" role="presentation">
      <section className="upload-choice-dialog" role="dialog" aria-modal="true" aria-labelledby="upload-choice-title">
        <div className="review-dialog-head">
          <div><span className="overline">ADD STATEMENTS</span><h2 id="upload-choice-title">What are you uploading?</h2></div>
          <button autoFocus onClick={() => setUploadDialogOpen(false)} aria-label="Close upload options"><X /></button>
        </div>
        <p>Choose the closest option. FinSim still checks every PDF and looks for same-month transfers or card payments across accounts.</p>
        <div className="upload-choice-grid">
          <button type="button" onClick={() => chooseUploadMode('single')}><FileText /><strong>Single bank account</strong><span>Checking or savings statements from one account.</span></button>
          <button type="button" onClick={() => chooseUploadMode('multiple')}><Sparkles /><strong>Multiple accounts</strong><span>Best for checking, savings and transfers between your own accounts.</span></button>
          <button type="button" onClick={() => chooseUploadMode('credit')}><FileCheck2 /><strong>Credit card statements</strong><span>FinSim matches card payments back to bank account withdrawals when possible.</span></button>
        </div>
        <small>Tip: Upload all statements that overlap the same month in one run when you want payment and transfer matching. Credit card uploads are verified after FinSim reads the PDFs.</small>
      </section>
    </div>}

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

async function statementFileHash(file: File) {
  if (!globalThis.crypto?.subtle) {
    return `${file.name}:${file.size}:${file.lastModified}`
  }
  const buffer = await file.arrayBuffer()
  const hashBuffer = await globalThis.crypto.subtle.digest('SHA-256', buffer)
  return Array.from(new Uint8Array(hashBuffer))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('')
}
