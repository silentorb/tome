import { HttpHandler } from './types'
import { DefaultContext } from 'koa'
import { ErrorHandler, sanitizeError } from './errors'

export function contextToRequest<T>(context: DefaultContext): T {
  const params = context.request.params || {}
  const body = context.request.body || {}
  return { ...params, ...body } as T
}

export const withJsonResponse = (onError: ErrorHandler) => <Request, Response>(loader: HttpHandler<Request, Response>) => async (context: DefaultContext) => {
  let request: any
  try {
    request = contextToRequest<Request>(context)
    context.body = await loader(request)
  } catch (error: any) {
    onError({
      context,
      error: sanitizeError(error),
      request
    })
  }
}
