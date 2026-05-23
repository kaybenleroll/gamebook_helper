import pino from 'pino'
import { AsyncLocalStorage } from 'async_hooks'

export const requestContext = new AsyncLocalStorage<{ requestId: string }>()

const logger = pino({
  level: process.env.NODE_ENV === 'production' ? 'info' : 'debug',
  ...(process.env.NODE_ENV !== 'production' && {
    transport: {
      target: 'pino-pretty',
      options: { colorize: true },
    },
  }),
  mixin() {
    const ctx = requestContext.getStore()
    return ctx ? { requestId: ctx.requestId } : {}
  },
})

export default logger
