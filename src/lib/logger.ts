import pino from 'pino'
import pretty from 'pino-pretty'
import { AsyncLocalStorage } from 'async_hooks'

export const requestContext = new AsyncLocalStorage<{ requestId: string }>()

const isDev = process.env.NODE_ENV !== 'production'

const logger = pino(
  {
    level: isDev ? 'debug' : 'info',
    mixin() {
      const ctx = requestContext.getStore()
      return ctx ? { requestId: ctx.requestId } : {}
    },
  },
  isDev ? pretty({ colorize: true, sync: true }) : pino.destination(1),
)

export default logger
