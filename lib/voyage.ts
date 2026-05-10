import { VoyageAIClient } from 'voyageai'

const voyage = new VoyageAIClient({ apiKey: process.env.VOYAGE_API_KEY! })

const EMBEDDING_MODEL = 'voyage-law-2'
const EMBEDDING_DIMENSION = 1024
const BATCH_SIZE = 50

const VOYAGE_TIMEOUT_MS = 25_000

async function embedWithRetry(
  input: string[],
  inputType: 'document' | 'query',
  attempt = 0
): Promise<{ data?: Array<{ embedding?: number[] }> }> {
  try {
    const embedPromise = voyage.embed({ input, model: EMBEDDING_MODEL, inputType })
    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('Voyage AI timeout after 25s')), VOYAGE_TIMEOUT_MS)
    )
    return await Promise.race([embedPromise, timeoutPromise])
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    // Voyage free tier: 3 RPM. Retry once after 20s on rate limit errors.
    if (attempt === 0 && (msg.includes('429') || msg.toLowerCase().includes('rate limit'))) {
      console.warn('[voyage] Rate limit hit — waiting 20s before retry')
      await new Promise((r) => setTimeout(r, 20_000))
      return embedWithRetry(input, inputType, 1)
    }
    throw err
  }
}

export async function embedText(
  text: string,
  inputType: 'document' | 'query' = 'document'
): Promise<number[]> {
  const result = await embedWithRetry([text], inputType)
  const embedding = result.data?.[0]?.embedding
  if (!embedding || embedding.length !== EMBEDDING_DIMENSION) {
    throw new Error(
      `Voyage embed returned unexpected dimension: ${embedding?.length ?? 'undefined'}`
    )
  }
  return embedding
}

export async function embedBatch(
  texts: string[],
  inputType: 'document' | 'query' = 'document'
): Promise<number[][]> {
  const allEmbeddings: number[][] = []

  for (let i = 0; i < texts.length; i += BATCH_SIZE) {
    const batch = texts.slice(i, i + BATCH_SIZE)
    const result = await embedWithRetry(batch, inputType)
    const batchEmbeddings = (result.data ?? []).map((item) => item.embedding ?? [])
    allEmbeddings.push(...batchEmbeddings)
    if (i + BATCH_SIZE < texts.length) {
      await new Promise((r) => setTimeout(r, 200))
    }
  }

  return allEmbeddings
}
