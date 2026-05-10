// Usage:
// npx tsx --env-file=.env.local scripts/ingest-md.ts <md-file-path> <metadata-json-path>
//
// Example:
// npx tsx --env-file=.env.local scripts/ingest-md.ts "C:\Users\asher\Downloads\KB_IRDAI_HEALTH_MC_29052024.md" scripts/source-docs/irdai-health-master-2024.json

import fs from 'fs'
import path from 'path'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { VoyageAIClient } from 'voyageai'

interface DocMetadata {
  tier: 1 | 2 | 3
  source_title: string
  circular_number: string
  issuer: string
  date: string
  url: string
}

interface ParsedChunk {
  section_number: string
  content: string
}

function parseYamlFrontmatter(raw: string): { body: string } {
  const lines = raw.split('\n')
  if (lines[0].trim() !== '---') return { body: raw }
  const closeIdx = lines.slice(1).findIndex((l) => l.trim() === '---')
  if (closeIdx === -1) return { body: raw }
  const body = lines.slice(closeIdx + 2).join('\n')
  return { body }
}

function parseChunks(body: string): ParsedChunk[] {
  const rawChunks = body.split(/\n---\n/)
  const chunks: ParsedChunk[] = []

  for (const raw of rawChunks) {
    const trimmed = raw.trim()
    if (!trimmed) continue

    const lines = trimmed.split('\n')

    // Extract section label from "## Chunk N: Title" heading
    let section_number = ''
    let contentStartIdx = 0
    const headingLine = lines.find((l) => l.startsWith('## '))
    if (headingLine) {
      section_number = headingLine.replace(/^##\s*/, '').trim()
      contentStartIdx = lines.indexOf(headingLine) + 1
    }

    // Strip "**Source section:**" line — navigation metadata, not content
    const remainingLines = lines
      .slice(contentStartIdx)
      .filter((l) => !l.startsWith('**Source section:**'))

    const content = remainingLines.join('\n').trim()

    // Skip chunks with fewer than 40 words
    const wordCount = content.split(/\s+/).filter(Boolean).length
    if (wordCount < 40) continue

    chunks.push({ section_number, content })
  }

  return chunks
}

async function embedBatch(
  voyage: VoyageAIClient,
  texts: string[]
): Promise<number[][]> {
  const BATCH_SIZE = 50
  const all: number[][] = []

  for (let i = 0; i < texts.length; i += BATCH_SIZE) {
    const batch = texts.slice(i, i + BATCH_SIZE)
    const result = await voyage.embed({ input: batch, model: 'voyage-law-2', inputType: 'document' })
    all.push(...(result.data ?? []).map((item) => item.embedding ?? []))
    if (i + BATCH_SIZE < texts.length) await new Promise((r) => setTimeout(r, 200))
  }
  return all
}

async function upsertChunk(
  supabase: SupabaseClient,
  meta: DocMetadata,
  chunk: ParsedChunk,
  embedding: number[]
): Promise<{ error: string | null }> {
  // Using plain insert — supabase-js generic resolution requires explicit cast for custom DB types
  const { error } = await (supabase as SupabaseClient).from('kb_chunks').insert({
    tier: meta.tier,
    source_title: meta.source_title,
    section_number: chunk.section_number || null,
    date: meta.date,
    circular_number: meta.circular_number,
    issuer: meta.issuer,
    url: meta.url,
    content: chunk.content,
    embedding,
  } as Parameters<ReturnType<SupabaseClient['from']>['insert']>[0])

  return { error: error?.message ?? null }
}

async function main() {
  const [, , mdFilePath, metaFilePath] = process.argv

  if (!mdFilePath || !metaFilePath) {
    console.error('Usage: npx tsx --env-file=.env.local scripts/ingest-md.ts <md-file> <meta-json>')
    process.exit(1)
  }

  const mdAbsolute = path.isAbsolute(mdFilePath) ? mdFilePath : path.resolve(process.cwd(), mdFilePath)
  const metaAbsolute = path.isAbsolute(metaFilePath) ? metaFilePath : path.resolve(process.cwd(), metaFilePath)

  if (!fs.existsSync(mdAbsolute)) { console.error(`MD file not found: ${mdAbsolute}`); process.exit(1) }
  if (!fs.existsSync(metaAbsolute)) { console.error(`Metadata JSON not found: ${metaAbsolute}`); process.exit(1) }

  const meta: DocMetadata = JSON.parse(fs.readFileSync(metaAbsolute, 'utf-8'))
  const rawMd = fs.readFileSync(mdAbsolute, 'utf-8')

  console.log(`\nIngesting: ${meta.source_title}`)
  console.log(`Circular: ${meta.circular_number}`)
  console.log(`File: ${path.basename(mdAbsolute)}\n`)

  const { body } = parseYamlFrontmatter(rawMd)
  const chunks = parseChunks(body)
  console.log(`Parsed ${chunks.length} chunks`)

  if (chunks.length === 0) { console.error('No chunks found. Check MD file format.'); process.exit(1) }

  const voyage = new VoyageAIClient({ apiKey: process.env.VOYAGE_API_KEY! })
  console.log('Embedding via Voyage AI (voyage-law-2)...')
  const embeddings = await embedBatch(voyage, chunks.map((c) => c.content))
  console.log(`Embedded ${embeddings.length} chunks\n`)

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )

  let inserted = 0
  let errors = 0

  for (let i = 0; i < chunks.length; i++) {
    const { error } = await upsertChunk(supabase, meta, chunks[i], embeddings[i])
    const label = chunks[i].section_number.slice(0, 60)
    if (error) {
      console.error(`  ✗ Chunk ${i + 1} (${label}): ${error}`)
      errors++
    } else {
      console.log(`  ✓ Chunk ${i + 1}: ${label}`)
      inserted++
    }
  }

  const totalWords = chunks.reduce((s, c) => s + c.content.split(/\s+/).length, 0)
  console.log(`\nDone. Inserted: ${inserted}, Errors: ${errors}`)
  console.log(`Estimated tokens: ~${Math.round(totalWords * 1.3)}`)
}

main().catch((err) => { console.error('Fatal:', err); process.exit(1) })
