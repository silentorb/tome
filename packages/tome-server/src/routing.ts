import Router from '@koa/router'
import { ServerConfig } from './types'
import { renderPage } from './rendering'
import { renderPageBaseOnResource } from './pages'

export function newRouter(config: ServerConfig) {
  const router = new Router()

  router.get('/data/:path*', renderPage(renderPageBaseOnResource(config)))
  return router
}
