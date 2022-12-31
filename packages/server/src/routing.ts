import Router from '@koa/router'
import { ServerConfig } from './types'
import { Endpoints } from '@tome/web-api'
import { loadNodeFromRequest, withJsonResponse } from './reading'
import { writeDocumentFromRequest } from './writing'

export function newRouter(config: ServerConfig) {
  const router = new Router()

  router.post(Endpoints.nodeGet, withJsonResponse(loadNodeFromRequest(config)))
  router.post(Endpoints.nodeSet, withJsonResponse(writeDocumentFromRequest(config)))

  return router
}
