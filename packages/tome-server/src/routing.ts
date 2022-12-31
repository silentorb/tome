import Router from '@koa/router'
import { ServerConfig } from './types'
import { loadNode, withJsonResponse, writeDocument } from './services'
import { Endpoints } from 'tome-common'

export function newRouter(config: ServerConfig) {
  const router = new Router()

  router.post(Endpoints.nodeGet, withJsonResponse(loadNode(config)))
  router.post(Endpoints.nodeSet, withJsonResponse(writeDocument(config)))

  return router
}
