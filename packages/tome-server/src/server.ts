import Koa from 'koa'
import { ServerConfig } from './types'
import { initializeConfig } from './config'
import { newRouter } from './routing'

export function startServer(config: ServerConfig = initializeConfig()) {
  const { port } = config

  const app = new Koa()
  const router = newRouter(config)
  app.use(router.routes())
  app.use(router.allowedMethods())

  console.log(`Starting server on port ${port}`)

  app.listen(port)
}
