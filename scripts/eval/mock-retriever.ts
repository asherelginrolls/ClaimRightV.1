// Lexical mock retriever for the golden eval (pipeline mode --mock-kb).
//
// Loads the real KB source chunks from scripts/kb-source-docs/*.md (the same
// files ingest-md.ts ingests — quarantine excluded) and scores them lexically
// against each angle query. This lets the full REASON→GROUND→VALIDATE +
// letter + span-validation pipeline run END-TO-END without Supabase/Voyage.
//
// HONESTY NOTE: similarity values are PSEUDO-scores derived from keyword
// overlap, not voyage-law-2 cosines. They exercise the pipeline mechanics
// (classification, citation gating, span validation) — they do NOT calibrate
// retrieval quality. The real retrieval benchmark runs post-restore.

import fs from 'fs'
import path from 'path'
import { randomUUID } from 'crypto'
import type { RetrievalResult } from '../../lib/retrieval'
import type { KbSearchResult } from '../../types/kb'
import { expandQueryWithSynonyms } from '../../lib/synonyms'

interface DocMeta {
  tier: 1 | 2 | 3
  source_title: string
  circular_number: string | null
  issuer: string
  date: string
  url: string
}

function parseChunksFromMd(body: string): Array<{ section_number: string; content: string }> {
  // Strip YAML frontmatter
  const lines = body.split('\n')
  let start = 0
  if (lines[0]?.trim() === '---') {
    const close = lines.slice(1).findIndex((l) => l.trim() === '---')
    if (close !== -1) start = close + 2
  }
  const rest = lines.slice(start).join('\n')

  return rest
    .split(/\n---\n/)
    .map((raw) => {
      const trimmed = raw.trim()
      if (!trimmed) return null
      const chunkLines = trimmed.split('\n')
      const heading = chunkLines.find((l) => l.startsWith('## '))
      const section_number = heading ? heading.replace(/^##\s*/, '').trim() : ''
      const contentStart = heading ? chunkLines.indexOf(heading) + 1 : 0
      const content = chunkLines.slice(contentStart).join('\n').trim()
      if (content.split(/\s+/).filter(Boolean).length < 40) return null
      return { section_number, content }
    })
    .filter((c): c is { section_number: string; content: string } => c !== null)
}

const STOP = new Set([
  'the', 'a', 'an', 'and', 'or', 'in', 'on', 'at', 'to', 'for', 'of', 'with',
  'is', 'was', 'are', 'be', 'shall', 'that', 'this', 'by', 'as', 'not', 'from',
  'india', 'insurance', 'health', 'irdai', 'insurer', 'policyholder', 'claim',
])

function tokens(s: string): string[] {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((t) => t.length > 2 && !STOP.has(t))
}

export function loadMockKb(repoRoot: string): KbSearchResult[] {
  const dir = path.join(repoRoot, 'scripts', 'kb-source-docs')
  const chunks: KbSearchResult[] = []
  for (const file of fs.readdirSync(dir)) {
    if (!file.endsWith('.md')) continue
    const mdPath = path.join(dir, file)
    const metaPath = mdPath.replace(/\.md$/, '.json')
    if (!fs.existsSync(metaPath)) continue
    const meta = JSON.parse(fs.readFileSync(metaPath, 'utf8')) as DocMeta
    for (const c of parseChunksFromMd(fs.readFileSync(mdPath, 'utf8'))) {
      chunks.push({
        id: randomUUID(),
        content: c.content,
        source_title: meta.source_title,
        section_number: c.section_number || null,
        circular_number: meta.circular_number,
        issuer: meta.issuer,
        url: meta.url,
        tier: meta.tier,
        similarity: 0, // filled per-query
      })
    }
  }
  return chunks
}

export function makeMockRetriever(repoRoot: string): (queries: string[]) => Promise<RetrievalResult[]> {
  const kb = loadMockKb(repoRoot)
  return async (queries: string[]) => {
    return queries.map((q) => {
      const qTokens = Array.from(new Set(tokens(expandQueryWithSynonyms(q))))
      const scored = kb
        .map((c) => {
          const cTokens = new Set(tokens(c.content + ' ' + (c.section_number ?? '')))
          const matched = qTokens.filter((t) => cTokens.has(t)).length
          const ratio = qTokens.length > 0 ? matched / qTokens.length : 0
          // Pseudo-similarity: 0.40 floor, 0.85 ceiling.
          const similarity = 0.4 + 0.45 * Math.min(1, ratio * 1.5)
          return { ...c, similarity }
        })
        .sort((a, b) => b.similarity - a.similarity)
        .slice(0, 8)
      return {
        chunks: scored,
        queryEmbedding: [],
        topScore: scored[0]?.similarity ?? 0,
      }
    })
  }
}
