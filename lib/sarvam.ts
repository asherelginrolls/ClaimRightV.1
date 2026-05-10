// Sarvam Vision API for Indian-language OCR (Devanagari, Tamil, Telugu, etc.)
// NOTE: The Sarvam Document Intelligence API is async (job-based). This implementation
// uses the v1/vision/ocr endpoint which may be available for simpler use cases.
// If this endpoint returns 404, update to use the full job-based flow at:
// https://docs.sarvam.ai/api-reference-docs/document-intelligence

export async function sarvamOcr(
  imageBase64: string,
  mimeType: 'image/jpeg' | 'image/png' | 'application/pdf'
): Promise<string> {
  const response = await fetch('https://api.sarvam.ai/v1/vision/ocr', {
    method: 'POST',
    headers: {
      'api-subscription-key': process.env.SARVAM_API_KEY!,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      image: imageBase64,
      mime_type: mimeType,
      language_hints: ['hi', 'en', 'mr', 'ta', 'te', 'kn', 'ml', 'bn', 'gu', 'pa'],
    }),
    signal: AbortSignal.timeout(30000),
  })

  if (!response.ok) {
    const err = await response.text()
    throw new Error(`Sarvam OCR failed: ${response.status} ${err}`)
  }

  const data = await response.json() as Record<string, unknown>
  const text = data.text ?? data.extracted_text ?? data.output ?? ''
  return typeof text === 'string' ? text : ''
}
