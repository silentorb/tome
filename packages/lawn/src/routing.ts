import Router from '@koa/router'
import { EndpointDefinition, HandlerAdapter, HttpHandler } from './types'
import { DefaultContext } from 'koa'
import { withJsonResponse } from './processing'
import { defaultErrorHandler, sendErrorResponse } from './errors'

export function contextToRequest<T>(context: DefaultContext): T {
  const params = context.request.params || {}
  const body = context.request.body || {}
  return { ...params, ...body } as T
}

type CreateEndpoints = (router: Router, adapter?: HandlerAdapter<any, any>) => (endpoints: EndpointDefinition[]) => void

export const defaultHandlerAdapter = () => withJsonResponse(defaultErrorHandler())

export const createEndpoints: CreateEndpoints = (router, adapter = defaultHandlerAdapter()) => endpoints => {
  for (const endpoint of endpoints) {
    router.register(endpoint.path, [endpoint.method], adapter(endpoint.handler))
  }
}

export type EndpointsTransform = (endpoints: EndpointDefinition[]) => EndpointDefinition[]

// Sorts endpoints so that more specific paths are prioritized over more general paths
export const sortEndpoints: EndpointsTransform = endpoints =>
  endpoints.sort((a, b) => b.path.localeCompare(a.path))

export const newRouter = (endpoints: EndpointDefinition[]): Router => {
  const router = new Router()
  createEndpoints(router)(endpoints)
  return router
}
