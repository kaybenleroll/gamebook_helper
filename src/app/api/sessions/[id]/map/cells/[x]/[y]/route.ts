import { NextRequest, NextResponse } from 'next/server'

// Map cell delete API will be reimplemented in a future slice (node-graph UI)
export async function DELETE(
  _request: NextRequest,
  _context: { params: Promise<{ id: string; x: string; y: string }> },
): Promise<NextResponse> {
  return NextResponse.json({ error: 'Not yet implemented' }, { status: 501 })
}
