import { PDFDocument, rgb, StandardFonts, type PDFFont, type PDFPage } from 'pdf-lib'
import type { GenerationResult } from '@/lib/generation'

const PAGE_WIDTH = 595
const PAGE_HEIGHT = 842
const MARGIN = 72

export async function generatePdf(letter: GenerationResult): Promise<Buffer> {
  const pdfDoc = await PDFDocument.create()
  const timesRoman = await pdfDoc.embedFont(StandardFonts.TimesRoman)
  const timesRomanBold = await pdfDoc.embedFont(StandardFonts.TimesRomanBold)

  // Mutable context so helpers can add pages and update the cursor
  const ctx: { page: PDFPage; y: number } = {
    page: pdfDoc.addPage([PAGE_WIDTH, PAGE_HEIGHT]),
    y: PAGE_HEIGHT - MARGIN,
  }

  function ensureSpace(needed: number) {
    if (ctx.y < MARGIN + needed) {
      ctx.page = pdfDoc.addPage([PAGE_WIDTH, PAGE_HEIGHT])
      ctx.y = PAGE_HEIGHT - MARGIN
    }
  }

  function drawHRule() {
    ensureSpace(24)
    ctx.page.drawLine({
      start: { x: MARGIN, y: ctx.y },
      end: { x: PAGE_WIDTH - MARGIN, y: ctx.y },
      thickness: 0.5,
      color: rgb(0.8, 0.8, 0.8),
    })
    ctx.y -= 20
  }

  function drawText(
    text: string,
    font: PDFFont = timesRoman,
    size: number = 11,
    color = rgb(0, 0, 0),
    indent = 0,
  ) {
    const maxWidth = PAGE_WIDTH - 2 * MARGIN - indent
    const words = text.split(' ')
    let line = ''

    for (const word of words) {
      const testLine = line ? `${line} ${word}` : word
      if (font.widthOfTextAtSize(testLine, size) > maxWidth && line) {
        ensureSpace(size + 6)
        ctx.page.drawText(line, { x: MARGIN + indent, y: ctx.y, size, font, color })
        ctx.y -= size + 4
        line = word
      } else {
        line = testLine
      }
    }
    if (line) {
      ensureSpace(size + 6)
      ctx.page.drawText(line, { x: MARGIN + indent, y: ctx.y, size, font, color })
      ctx.y -= size + 4
    }
  }

  function drawBlock(
    text: string,
    font: PDFFont = timesRoman,
    size = 11,
    color = rgb(0, 0, 0),
  ) {
    for (const line of text.split('\n')) {
      if (line.trim() === '') {
        ctx.y -= size
      } else {
        drawText(line, font, size, color)
      }
    }
  }

  // ── Header ──────────────────────────────────────────────────────────────────
  drawText('CLAIMRIGHT', timesRomanBold, 14)
  drawText('Health Insurance Dispute Letter', timesRoman, 11, rgb(0.3, 0.3, 0.3))
  ctx.y -= 8
  drawHRule()

  // ── Subject ──────────────────────────────────────────────────────────────────
  drawText(letter.subjectLine, timesRomanBold, 12)
  ctx.y -= 8

  // ── Salutation ───────────────────────────────────────────────────────────────
  drawText(letter.salutation)
  ctx.y -= 6

  // ── Body paragraphs ──────────────────────────────────────────────────────────
  for (const para of letter.paragraphs) {
    drawBlock(para.validatedText)
    ctx.y -= 8
  }

  // ── Relief sought ────────────────────────────────────────────────────────────
  ctx.y -= 8
  drawText('Relief Sought:', timesRomanBold)
  drawBlock(letter.reliefSought)
  ctx.y -= 8

  // ── Closing + signature ──────────────────────────────────────────────────────
  drawBlock(letter.closing)
  ctx.y -= 20
  drawText('Yours sincerely,')
  ctx.y -= 30
  drawText('Policyholder')
  ctx.y -= 20

  // ── Footer ───────────────────────────────────────────────────────────────────
  drawHRule()
  drawBlock(
    'This letter is based on verified IRDAI regulations and ombudsman precedents. All citations are sourced from official IRDAI circulars. This is not legal advice.',
    timesRoman,
    8,
    rgb(0.5, 0.5, 0.5),
  )

  return Buffer.from(await pdfDoc.save())
}
