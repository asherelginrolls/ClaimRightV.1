import { NextRequest, NextResponse } from 'next/server'

// Admin-only route — protected by ADMIN_SECRET header
// Real ingestion logic will be added when KB population session runs
export async function POST(request: NextRequest): Promise<NextResponse> {
  const authHeader = request.headers.get('authorization')
  const adminSecret = process.env.ADMIN_SECRET

  if (!adminSecret) {
    return NextResponse.json({ error: 'Admin secret not configured' }, { status: 500 })
  }

  if (authHeader !== `Bearer ${adminSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  return NextResponse.json(
    { error: 'KB ingestion not yet implemented. Use the ingest scripts directly.' },
    { status: 501 }
  )
}
