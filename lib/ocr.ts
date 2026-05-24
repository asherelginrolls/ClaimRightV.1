import { haiku } from '@/lib/claude'

// NOTE: Sarvam Vision routing was removed for both PDFs and images.
// Reading raw binary (PDF streams or JPEG/PNG bytes) as UTF-8 and matching
// against Devanagari Unicode ranges yields essentially random results, so the
// branch was firing inconsistently and producing 30s Sarvam timeouts in
// production. Claude Haiku Vision handles English + Indian-script documents
// natively for both PDFs and images.

export async function extractTextFromDocument(
  fileBuffer: Buffer,
  mimeType: string
): Promise<string> {
  const base64 = fileBuffer.toString('base64')

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
