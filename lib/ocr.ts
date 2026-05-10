import { sarvamOcr } from '@/lib/sarvam'
import { haiku } from '@/lib/claude'

// Unicode ranges for major Indian scripts
const INDIAN_SCRIPT_REGEX =
  /[ऀ-ॿঀ-৿਀-੿઀-૿଀-୿஀-௿ఀ-౿ಀ-೿ഀ-ൿ]/

function hasIndianScript(buffer: Buffer): boolean {
  // Sample the first 5000 bytes as UTF-8 text
  const sample = buffer.toString('utf8', 0, Math.min(5000, buffer.length))
  return INDIAN_SCRIPT_REGEX.test(sample)
}

export async function extractTextFromDocument(
  fileBuffer: Buffer,
  mimeType: string
): Promise<string> {
  const base64 = fileBuffer.toString('base64')

  if (hasIndianScript(fileBuffer)) {
    try {
      return await sarvamOcr(
        base64,
        mimeType as 'image/jpeg' | 'image/png' | 'application/pdf'
      )
    } catch (err) {
      // Sarvam failed — fall through to Claude Haiku as safety net
      console.warn('[ocr] Sarvam OCR failed, falling back to Claude Haiku:', err)
    }
  }

  // Claude Haiku Vision for English documents (and Sarvam fallback)
  if (mimeType === 'application/pdf') {
    // PDFs: use Claude's native document support
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

  // JPEG / PNG: use image vision
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
