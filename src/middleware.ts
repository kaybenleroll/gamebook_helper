import { NextRequest, NextResponse } from 'next/server'
import { randomUUID } from 'crypto'
import logger, { requestContext } from '@/lib/logger'

export function middleware(request: NextRequest) {
  const requestId = randomUUID()

  const response = NextResponse.next()
  response.headers.set('X-Request-Id', requestId)

  return requestContext.run({ requestId }, () => {
    logger.info({
      method: request.method,
      path: request.nextUrl.pathname,
      requestId,
    }, 'request received')

    // Note: duration logging on response is not possible in Next.js middleware
    // Log at request start only; errors are caught in route handlers
    return response
  })
}

export const config = {
  matcher: '/api/:path*',
}
