import { NextRequest, NextResponse } from 'next/server'

// Map API routes will be reimplemented in a future slice (node-graph UI)
export async function GET(
  _request: NextRequest,
  _context: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  return NextResponse.json({ error: 'Not yet implemented' }, { status: 501 })
}
