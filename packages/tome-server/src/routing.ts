import Router from '@koa/router'
import { ServerConfig } from './types'
import { loadNode, withJsonResponse } from './reading'

export function newRouter(config: ServerConfig) {
  const router = new Router()

  router.post('/node/query', withJsonResponse(loadNode(config)))
  // router.get('/', context => context.redirect('/data'))
  return router
}
