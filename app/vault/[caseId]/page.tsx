// Case detail — header + escalation timeline + uploaded documents.

import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getAuthenticatedUser } from '@/lib/auth'
import { createServiceClient, type Database } from '@/lib/supabase'
import { CaseTimeline } from '@/app/components/CaseTimeline'

export const dynamic = 'force-dynamic'

type CaseRow = Database['public']['Tables']['cases']['Row']
type CaseDocRow = Database['public']['Tables']['case_documents']['Row']

const CATEGORY_LABELS: Record<NonNullable<CaseRow['rejection_reason_category']>, string> = {
  pre_existing_condition: 'Pre-existing condition',
  policy_exclusion: 'Policy exclusion',
  documentation_incomplete: 'Documentation incomplete',
  non_disclosure: 'Non-disclosure',
  waiting_period: 'Waiting period',
  cashless_denial: 'Cashless denial',
  experimental_treatment: 'Experimental treatment',
  fraud_suspected: 'Fraud suspected',
  other: 'Other',
}

const SCORE_STYLES: Record<NonNullable<CaseRow['fightability_score']>, string> = {
  strong: 'border-hope/40 bg-hope/10 text-hope',
  medium: 'border-sun bg-sun/15 text-gold-ink',
  low: 'border-rule-strong bg-mist text-slate-muted',
}

const SCORE_LABELS: Record<NonNullable<CaseRow['fightability_score']>, string> = {
  strong: 'Strong case',
  medium: 'Worth fighting',
  low: 'Difficult',
}

const DOC_TYPE_LABELS: Record<CaseDocRow['doc_type'], string> = {
  rejection_letter: 'Rejection letter',
  policy_document: 'Policy document',
  hospital_bills: 'Hospital bills',
  discharge_summary: 'Discharge summary',
  prior_correspondence: 'Insurer correspondence',
  other: 'Other document',
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}

export default async function CaseDetailPage({ params }: { params: { caseId: string } }) {
  const user = await getAuthenticatedUser()
  if (!user) redirect(`/auth?next=/vault/${params.caseId}`)

  const supabase = createServiceClient()
  const { data: rawCase } = await supabase
    .from('cases')
    .select('*')
    .eq('id', params.caseId)
    .single()
  if (!rawCase) redirect('/vault')
  const caseRow = rawCase as CaseRow
  if (caseRow.user_id !== user.id) redirect('/vault')

  const { data: rawDocs } = await supabase
    .from('case_documents')
    .select('*')
    .eq('case_id', params.caseId)
    .order('uploaded_at', { ascending: true })
  const docs = (rawDocs ?? []) as CaseDocRow[]

  return (
    <main className="min-h-[calc(100vh-8rem)] bg-mist px-6 py-14">
      <div className="mx-auto max-w-3xl">
        <Link
          href="/vault"
          className="mb-8 inline-flex items-center gap-1 font-mono text-xs text-slate-muted transition-colors hover:text-ink"
        >
          ← All my cases
        </Link>

        <div className="mb-8">
          <p className="mb-2 font-mono text-[11px] uppercase tracking-[0.22em] text-blue">
            Case opened {formatDate(caseRow.created_at)}
          </p>
          <h1 className="font-display text-3xl font-semibold text-ink-deep sm:text-4xl">
            {caseRow.insurer ?? 'Insurer pending analysis'}
          </h1>
          <div className="mt-4 flex flex-wrap items-center gap-2">
            {caseRow.claim_amount != null && (
              <span className="inline-flex items-center rounded-full border border-rule-strong bg-paper px-3 py-1 font-mono text-[11px] tracking-wide text-ink">
                ₹{Math.round(caseRow.claim_amount / 100).toLocaleString('en-IN')}
              </span>
            )}
            {caseRow.rejection_reason_category && (
              <span className="inline-flex items-center rounded-full border border-rule-strong bg-paper px-3 py-1 font-mono text-[10px] uppercase tracking-[0.14em] text-slate">
                {CATEGORY_LABELS[caseRow.rejection_reason_category]}
              </span>
            )}
            {caseRow.fightability_score && (
              <span
                className={`inline-flex items-center rounded-full border px-3 py-1 font-mono text-[10px] uppercase tracking-[0.14em] ${SCORE_STYLES[caseRow.fightability_score]}`}
              >
                {SCORE_LABELS[caseRow.fightability_score]}
              </span>
            )}
          </div>
        </div>

        <CaseTimeline
          caseId={params.caseId}
          paid={!!caseRow.paid_at}
          rejectionDate={caseRow.rejection_date}
        />

        <div className="mt-10">
          <p className="mb-3 font-mono text-[10px] uppercase tracking-[0.18em] text-slate-faint">
            Your documents
          </p>
          {docs.length === 0 ? (
            <div className="rounded-2xl border border-rule bg-paper px-6 py-5 shadow-lift">
              <p className="font-sans text-sm text-slate">No documents on this case yet.</p>
            </div>
          ) : (
            <div className="rounded-2xl border border-rule bg-paper shadow-lift">
              {docs.map((d, i) => (
                <div
                  key={d.id}
                  className={`flex items-center justify-between px-6 py-4 ${
                    i > 0 ? 'border-t border-rule' : ''
                  }`}
                >
                  <p className="font-sans text-sm font-medium text-ink">
                    {DOC_TYPE_LABELS[d.doc_type]}
                  </p>
                  <p className="font-mono text-[11px] tracking-wide text-slate-muted">
                    uploaded {formatDate(d.uploaded_at)}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </main>
  )
}
