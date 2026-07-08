// Quick live check of the Sarvam job-based OCR integration.
// Usage: npx tsx --env-file=.env.local scripts/sarvam-live-test.ts
import { readFileSync } from 'fs'
import { join } from 'path'
import { sarvamOcrPdf } from '../lib/sarvam'

async function main() {
  const t0 = Date.now()
  const pdf = readFileSync(join(process.cwd(), 'scripts', 'test-docs', 'test-rejection-letter.pdf.pdf'))
  const text = await sarvamOcrPdf(pdf)
  console.log(`ok in ${((Date.now() - t0) / 1000).toFixed(1)}s, ${text.length} chars`)
  console.log(text.slice(0, 200).replace(/\n/g, ' | '))
}
main().catch((e) => {
  console.error('ERR', e instanceof Error ? e.message : e)
  process.exit(1)
})
