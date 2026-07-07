// Case Vault — every case the signed-in user has run, newest first.

import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getAuthenticatedUser } from '@/lib/auth'
import { createServiceClient, type Database } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

type CaseRow = Database['public']['Tables']['cases']['Row']

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

const STATUS_LABELS: Record<CaseRow['status'], string> = {
  uploaded: 'Uploaded',
  analysed: 'Analysed',
  paid: 'Paid',
  generating: 'Preparing letter',
  generated: 'Letter ready',
  delivered: 'Delivered',
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}

export default async function VaultPage() {
  const user = await getAuthenticatedUser()
  if (!user) redirect('/auth?next=/vault')

  const supabase = createServiceClient()
  const { data: rawCases } = await supabase
    .from('cases')
    .select('*')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
  const cases = (rawCases ?? []) as CaseRow[]

  return (
    <main className="min-h-[calc(100vh-8rem)] bg-mist px-6 py-14">
      <div className="mx-auto max-w-3xl">
        <div className="mb-8">
          <p className="mb-2 font-mono text-[11px] uppercase tracking-[0.22em] text-blue">
            My cases
          </p>
          <h1 className="font-display text-3xl font-semibold text-ink-deep sm:text-4xl">
            Your case vault
          </h1>
          <p className="mt-3 font-sans text-base leading-relaxed text-slate">
            Every dispute you&apos;ve started, in one place — your documents, your letters, and
            where each case stands.
          </p>
        </div>

        {cases.length === 0 ? (
          <div className="rounded-2xl border border-rule bg-paper px-8 py-12 text-center shadow-lift">
            <p className="font-display text-xl font-semibold text-ink-deep">
              Nothing here yet — and that&apos;s easy to fix.
            </p>
            <p className="mx-auto mt-3 max-w-md font-sans text-sm leading-relaxed text-slate">
              Start by checking a rejection letter. We&apos;ll read it against real IRDAI rules and
              tell you plainly whether it&apos;s worth fighting.
            </p>
            <Link
              href="/upload"
              className="mt-6 inline-block rounded-full bg-blue px-6 py-3 font-sans text-sm font-semibold text-white shadow-lift transition-colors hover:bg-blue-deep"
            >
              Check my rejection letter
            </Link>
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            {cases.map((c) => (
              <Link
                key={c.id}
                href={`/vault/${c.id}`}
                className="block rounded-2xl border border-rule bg-paper px-6 py-5 shadow-lift transition-colors hover:border-blue/40"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="font-display text-lg font-semibold text-ink-deep">
                      {c.insurer ?? 'Insurer pending analysis'}
                    </p>
                    <p className="mt-1 font-mono text-[11px] tracking-wide text-slate-muted">
                      {c.claim_amount != null
                        ? `₹${Math.round(c.claim_amount / 100).toLocaleString('en-IN')}`
                        : 'Amount pending'}{' '}
                      · started {formatDate(c.created_at)}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    {c.fightability_score && (
                      <span
                        className={`inline-flex items-center rounded-full border px-3 py-1 font-mono text-[10px] uppercase tracking-[0.14em] ${SCORE_STYLES[c.fightability_score]}`}
                      >
                        {SCORE_LABELS[c.fightability_score]}
                      </span>
                    )}
                    <span className="inline-flex items-center rounded-full border border-rule-strong bg-mist px-3 py-1 font-mono text-[10px] uppercase tracking-[0.14em] text-slate">
                      {STATUS_LABELS[c.status]}
                    </span>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </main>
  )
}
