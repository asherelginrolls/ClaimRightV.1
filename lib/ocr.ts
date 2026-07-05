import { haiku } from '@/lib/claude'
import { sarvamOcr } from '@/lib/sarvam'

async function haikuOcrPdf(base64: string): Promise<string> {
  const message = await haiku.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 4000,
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'document',
            source: {
              type: 'base64',
              media_type: 'application/pdf',
              data: base64,
            },
          },
          {
            type: 'text',
            text: 'Extract all text from this document exactly as it appears. Return only the extracted text, no commentary.',
          },
        ],
      },
    ],
  })
  return message.content[0]?.type === 'text' ? message.content[0].text : ''
}

export async function extractTextFromDocument(
  fileBuffer: Buffer,
  mimeType: string
): Promise<string> {
  const base64 = fileBuffer.toString('base64')

  if (mimeType === 'application/pdf') {
    // Try Sarvam first — it handles Indian-language PDFs (Hindi, Marathi, Tamil, etc.)
    // as well as English. Fall back to Claude Haiku Vision on any error.
    try {
      const sarvamText = await sarvamOcr(base64, 'application/pdf')
      if (sarvamText.trim().length > 0) return sarvamText
    } catch {
      // Sarvam failed or unavailable — fall through to Haiku
    }
    return haikuOcrPdf(base64)
  }

  // JPEG / PNG: use Haiku image vision directly
  const imageMediaType = (
    mimeType === 'image/png' ? 'image/png' : 'image/jpeg'
  ) as 'image/jpeg' | 'image/png'

  const message = await haiku.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 4000,
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'image',
            source: {
              type: 'base64',
              media_type: imageMediaType,
              data: base64,
            },
          },
          {
            type: 'text',
            text: 'Extract all text from this document exactly as it appears. Return only the extracted text, no commentary.',
          },
        ],
      },
    ],
  })
  return message.content[0]?.type === 'text' ? message.content[0].text : ''
}
