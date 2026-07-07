// Scratch: extract the IRDAI exclusions circular verbatim via Haiku PDF support.
import fs from 'fs'
import Anthropic from '@anthropic-ai/sdk'

const PDF_PATH = process.argv[2]
const PROMPT = process.argv[3]
const OUT = process.argv[4]

async function main() {
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY, timeout: 300_000 })
  const base64 = fs.readFileSync(PDF_PATH).toString('base64')
  const msg = await client.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 16000,
    temperature: 0,
    messages: [
      {
        role: 'user',
        content: [
          { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: base64 } },
          { type: 'text', text: PROMPT },
        ],
      },
    ],
  })
  const text = msg.content.map((c) => (c.type === 'text' ? c.text : '')).join('')
  fs.writeFileSync(OUT, text, 'utf8')
  console.log(`wrote ${text.length} chars to ${OUT}`)
  console.log(`usage: in=${msg.usage.input_tokens} out=${msg.usage.output_tokens}`)
}
main().catch((e) => { console.error(e); process.exit(1) })
